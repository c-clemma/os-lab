#include <stdio.h>
#include "request.h"
#include "io_helper.h"
#include <pthread.h>

char default_root[] = ".";

int threads = 1;

int *buffer;
int buffer_size = 1;

// variables from p/c-problem
int fill_ptr = 0;
int use_ptr = 0;
int buffer_count = 0;

pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t readable = PTHREAD_COND_INITIALIZER;
pthread_cond_t fillable = PTHREAD_COND_INITIALIZER;

void put(int value)
{
	buffer[fill_ptr] = value;
	fill_ptr = (fill_ptr + 1) % buffer_size;
	buffer_count++;
}

// currently default: FIFO
int get()
{
	int tmp = buffer[use_ptr];
	use_ptr = (use_ptr + 1) % buffer_size;
	buffer_count--;
	return tmp;
}

void *worker(void *arg)
{
	while (1)
	{
		Pthread_mutex_lock(&mutex);
		while (buffer_count == 0)
		{
			Pthread_cond_wait(&readable, &mutex);
		}
		int conn_fd = get(); // c4
		Pthread_cond_signal(&fillable);
		Pthread_mutex_unlock(&mutex);
		request_handle(conn_fd); // handels a request
		close_or_die(conn_fd);
	}
}

//
// ./wserver [-d <basedir>] [-p <portnum>]
// prompt> ./wserver [-d basedir] [-p port] [-t threads] [-b buffers] [-s schedalg]
//

int main(int argc, char *argv[])
{
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
			// could handle change between FIFO and SFF; but not necessary right now
			break;
		case 'l':
			/*
			TODO: Logging
				The webserver should have an additional command-line argument [-l log_file]. If
				the log ile is specified, each request should be logged into that file with the time in
				seconds since the start of the program as follows:
				o 34.0002s [Thread Main] Arrived - request: GET /index.html
				o 34.0010s [Thread 2] Started - request: GET /index.html (0.0008s waiting)
				o 34.0222s [Thread 2] Completed - request: GET /index.html (0.0220s total)
				• Important: each thread should open the logfile own its own. E.g., each thread should have
				its own file descriptor for the log file. (This is important to avoid the OS's built-in
				synchronization for file accesses and give you control.) However, you will need to add
				synchronization so the logs aren't corrupted.
			*/
			break;
		default:
			fprintf(stderr, "usage: wserver [-d basedir] [-p port]\n");
			exit(1);
		}

	// run out of this directory
	chdir_or_die(root_dir);

	// now, get to work -> accept loop
	int listen_fd = open_listen_fd_or_die(port); // automates the process of creating and configuring a listening socket

	// initialize buffer
	buffer = malloc(buffer_size * sizeof(int));

	// 1 producer
	while (1)
	{
		struct sockaddr_in client_addr;
		int client_len = sizeof(client_addr);
		// blocks/sleeps until a client connects
		// TODO create threads worker
		int conn_fd = accept_or_die(listen_fd, (sockaddr_t *)&client_addr, (socklen_t *)&client_len);

		Pthread_mutex_lock(&mutex);
		while (buffer_count == buffer_size)
		{
			Pthread_cond_wait(&fillable, &mutex);
		}
		put(conn_fd);
		Pthread_cond_signal(&readable);
		Pthread_mutex_unlock(&mutex);
	}
	return 0;
}
