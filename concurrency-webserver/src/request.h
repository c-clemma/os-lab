#ifndef __REQUEST_H__
#define __REQUEST_H__

// Reads only the request line off the socket, leaving the headers for
// request_serve(). A worker calls this first so it knows what the request was
// before it serves it, which is needed for log lines.
// Returns 0 on success, -1 if the client disconnected without sending a
// request line (speculative browser connections).
int request_parse_line(int fd, char *method, char *uri, char *version);

// Serves a request whose first line has already been read by the caller.
void request_serve(int fd, char *method, char *uri);

#endif // __REQUEST_H__
