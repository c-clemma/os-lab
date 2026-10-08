#include <stdio.h>
#include "request.h"
#include "io_helper.h"
#include <pthread.h>
#include <time.h>
#define MAXBUF (8192)

char default_root[] = ".";

int threads = 1;

// One slot of the shared buffer. The master fills this in before queueing,
// so a worker gets everything it needs to serve the request *and* to log it.
typedef struct
{
	int conn_fd;
	struct timespec arrival; // timing of arrival
	char method[MAXBUF];
	char uri[MAXBUF];
} request_t;

request_t *buffer;
int buffer_size = 1;

// variables from p/c-problem
int fill_ptr = 0;
int use_ptr = 0;
int buffer_count = 0;

pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t readable = PTHREAD_COND_INITIALIZER;
pthread_cond_t fillable = PTHREAD_COND_INITIALIZER;

char *outfile = NULL;
struct timespec ts; // program start, every log timestamp is relative to this
pthread_mutex_t log_mutex = PTHREAD_MUTEX_INITIALIZER;

//
// Logging
//

// Try to open file
int log_open()
{
	if (outfile == NULL)
		return -1;
	return open(outfile, O_CREAT | O_WRONLY | O_APPEND, 0644);
}

// Seconds between two readings of CLOCK_MONOTONIC
double time_diff(struct timespec start, struct timespec end)
{
	return (end.tv_sec - start.tv_sec) + (end.tv_nsec - start.tv_nsec) / 1e9;
}

// Formating and writing to log file
void log_event(int log_fd, struct timespec now, char *label, char *status,
			   char *method, char *uri, char *tail)
{
	if (log_fd < 0)
		return;

	char line[MAXBUF];
	int len = snprintf(line, sizeof line, "%.4fs [Thread %s] %s - request: %s %s%s\n",
					   time_diff(ts, now), label, status, method, uri, tail);
	if (len < 0)
		return;
	if (len >= (int)sizeof line) // snprintf returns what it WANTED to write
		len = sizeof line - 1;

	pthread_mutex_lock(&log_mutex);
	write(log_fd, line, len);
	pthread_mutex_unlock(&log_mutex);
}

void put(request_t value)
{
	buffer[fill_ptr] = value;
	fill_ptr = (fill_ptr + 1) % buffer_size;
	buffer_count++;
}

// currently default: FIFO
request_t get()
{
	request_t tmp = buffer[use_ptr];
	use_ptr = (use_ptr + 1) % buffer_size;
	buffer_count--;
	return tmp;
}

void *worker(void *arg)
{
	int id = (int)(long)arg; // single value passed as the void *
	char label[16];
	snprintf(label, sizeof label, "%d", id);

	int log_fd = log_open(); // open log file for this thread
	char tail[64];

	while (1)
	{
		pthread_mutex_lock(&mutex);
		while (buffer_count == 0)
		{
			pthread_cond_wait(&readable, &mutex);
		}
		request_t req = get(); // c4
		pthread_cond_signal(&fillable);
		pthread_mutex_unlock(&mutex);

		struct timespec started;
		clock_gettime(CLOCK_MONOTONIC, &started);
		snprintf(tail, sizeof tail, " (%.4fs waiting)", time_diff(req.arrival, started));
		log_event(log_fd, started, label, "Started", req.method, req.uri, tail);

		request_serve(req.conn_fd, req.method, req.uri); // handles a request

		struct timespec completed;
		clock_gettime(CLOCK_MONOTONIC, &completed);
		snprintf(tail, sizeof tail, " (%.4fs total)", time_diff(req.arrival, completed));
		log_event(log_fd, completed, label, "Completed", req.method, req.uri, tail);

		close_or_die(req.conn_fd);
	}
	return NULL;
}

//
// ./wserver [-d <basedir>] [-p <portnum>]
// prompt> ./wserver [-d basedir] [-p port] [-t threads] [-b buffers] [-s schedalg] [-l logging]
//

int main(int argc, char *argv[])
{
	clock_gettime(CLOCK_MONOTONIC, &ts); // Start program clocking
	int c;
	char *root_dir = default_root;
	int port = 10000;

	while ((c = getopt(argc, argv, "d:p:t:b:s:l:")) != -1) // Parses command line options and parameter list
		switch (c)
		{
		case 'd':
			root_dir = optarg;
			break;
		case 'p':
			port = atoi(optarg);
			break;
		case 't':
		{
			int t = atoi(optarg);
			threads = (t > 0) ? t : 1;
			break;
		}
		case 'b':
		{
			int b = atoi(optarg);
			buffer_size = (b > 0) ? b : 1;
			break;
		}
		case 's':
			if (strcmp(optarg, "SFF") == 0 || strcmp(optarg, "FIFO") == 0)
			{
				if (strcmp(optarg, "SFF") == 0)
				{
					// TODO: Implement SFF
					fprintf(stderr, "SFF is not implemented yet.\n");
					exit(1);
				}
			}
			else
			{
				fprintf(stderr, "usage: wserver [-d basedir] [-p port] [-t threads] [-b buffers] [-s schedalg] [-l logging]\n");
				exit(1);
			}
			break;
		case 'l':
			outfile = optarg; // get file name
			break;
		default:
			fprintf(stderr, "usage: wserver [-d basedir] [-p port] [-t threads] [-b buffers] [-s schedalg] [-l logging]\n");
			exit(1);
		}

	// run out of this directory
	chdir_or_die(root_dir);

	// now, get to work -> accept loop
	int listen_fd = open_listen_fd_or_die(port); // automates the process of creating and configuring a listening socket

	// initialize buffer
	buffer = malloc(buffer_size * sizeof(request_t));
	if (buffer == NULL)
	{
		fprintf(stderr, "malloc failed\n");
		exit(1);
	}

	int log_fd = log_open(); // open log file for master
	if (outfile !=NULL && log_fd<0)
	{
		fprintf(stderr, "usage: wserver [-d basedir] [-p port] [-t threads] [-b buffers] [-s schedalg] [-l logging]\n");
		exit(1);
	}

	for (int i = 0; i < threads; i++)
	{
		pthread_t p1;
		if (pthread_create(&p1, NULL, worker, (void *)(long)(i + 1)) != 0)
		{
			fprintf(stderr, "pthread_create failed\n");
			exit(1);
		}
	}

	// 1 producer
	while (1)
	{
		struct sockaddr_in client_addr;
		int client_len = sizeof(client_addr);
		char version[MAXBUF];
		request_t req;

		// blocks/sleeps until a client connects
		req.conn_fd = accept_or_die(listen_fd, (sockaddr_t *)&client_addr, (socklen_t *)&client_len);
		clock_gettime(CLOCK_MONOTONIC, &req.arrival); // time of request

		// the master reads the request line so it can log what arrived; the
		// worker picks the request up from the headers onward
		request_parse_line(req.conn_fd, req.method, req.uri, version);
		log_event(log_fd, req.arrival, "Main", "Arrived", req.method, req.uri, "");

		pthread_mutex_lock(&mutex);
		while (buffer_count == buffer_size)
		{
			pthread_cond_wait(&fillable, &mutex);
		}
		put(req);
		pthread_cond_signal(&readable);
		pthread_mutex_unlock(&mutex);
	}
	return 0;
}
