#ifndef __REQUEST_H__
#define __REQUEST_H__

// Reads only the first line of the request off the socket. The master
// calls this so it can log what arrived
// everything after that line is left on the socket for the worker.
void request_parse_line(int fd, char *method, char *uri, char *version);

// Serves a request whose first line has already been read by the caller.
void request_serve(int fd, char *method, char *uri);

// Reads and serves a request from start to finish.
void request_handle(int fd);

#endif // __REQUEST_H__
