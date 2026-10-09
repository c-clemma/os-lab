#include "io_helper.h"
#include "request.h"

//
// Some of this code stolen from Bryant/O'Halloran
// Hopefully this is not a problem ... :)
//

#define MAXBUF (8192)


//
// A client that abandons its connection must only cost one request.
//
// Writes len bytes, retrying on short writes. Returns 0 on success, -1 if the
// client has gone away (EPIPE / ECONNRESET).
int write_to_client(int fd, char *buf, size_t len)
{
    size_t written = 0;

    while (written < len)
    {
        ssize_t rc = write(fd, buf + written, len - written);
        if (rc < 0)
        {
            if (errno == EINTR)
                continue;
            return -1;
        }
        written += rc;
    }
    return 0;
}

// Returns -1 instead of aborting when the connection breaks.
// Returns the number of bytes read, 0 at EOF, -1 on error.
ssize_t readline_from_client(int fd, void *buf, size_t maxlen)
{
    char *bufp = buf;
    size_t n = 0;

    while (n < maxlen - 1)
    {
        char c;
        ssize_t rc = read(fd, &c, 1);
        if (rc == 1)
        {
            *bufp++ = c;
            n++;
            if (c == '\n')
                break;
        }
        else if (rc == 0)
        {
            break; // EOF: client closed the connection
        }
        else if (errno != EINTR)
        {
            // the client connected but never sent anything, treated like any other dead connection.
            *bufp = '\0';
            return -1;
        }
    }
    *bufp = '\0';
    return n;
}

void request_error(int fd, char *cause, char *errnum, char *shortmsg, char *longmsg)
{
    char buf[MAXBUF], body[MAXBUF];

    // Create the body of error message first (have to know its length for header)
    sprintf(body, ""
                  "<!doctype html>\r\n"
                  "<head>\r\n"
                  "  <title>OSTEP WebServer Error</title>\r\n"
                  "</head>\r\n"
                  "<body>\r\n"
                  "  <h2>%s: %s</h2>\r\n"
                  "  <p>%s: %s</p>\r\n"
                  "</body>\r\n"
                  "</html>\r\n",
            errnum, shortmsg, longmsg, cause);

    // Write out the header information for this response
    sprintf(buf, "HTTP/1.0 %s %s\r\n", errnum, shortmsg);
    if (write_to_client(fd, buf, strlen(buf)) < 0)
        return;

    sprintf(buf, "Content-Type: text/html\r\n");
    if (write_to_client(fd, buf, strlen(buf)) < 0)
        return;

    sprintf(buf, "Content-Length: %lu\r\n\r\n", strlen(body));
    if (write_to_client(fd, buf, strlen(buf)) < 0)
        return;

    // Write out the body last
    write_to_client(fd, body, strlen(body));
}

//
// Reads and discards everything up to an empty text line
//
// Returns 0 once the blank line is reached, -1 if the client disconnected first
int request_read_headers(int fd)
{
    char buf[MAXBUF];

    if (readline_from_client(fd, buf, MAXBUF) <= 0)
        return -1;
    while (strcmp(buf, "\r\n"))
    {
        if (readline_from_client(fd, buf, MAXBUF) <= 0)
            return -1;
    }
    return 0;
}

//
// Return 1 if static, 0 if dynamic content
// Calculates filename (and cgiargs, for dynamic) from uri
//
int request_parse_uri(char *uri, char *filename, char *cgiargs)
{
    char *ptr;

    if (!strstr(uri, "cgi"))
    {
        // static
        strcpy(cgiargs, "");
        sprintf(filename, ".%s", uri);
        if (uri[strlen(uri) - 1] == '/')
        {
            strcat(filename, "index.html");
        }
        return 1;
    }
    else
    {
        // dynamic
        ptr = index(uri, '?');
        if (ptr)
        {
            strcpy(cgiargs, ptr + 1);
            *ptr = '\0';
        }
        else
        {
            strcpy(cgiargs, "");
        }
        sprintf(filename, ".%s", uri);
        return 0;
    }
}

//
// Fills in the filetype given the filename
//
void request_get_filetype(char *filename, char *filetype)
{
    if (strstr(filename, ".html"))
        strcpy(filetype, "text/html");
    else if (strstr(filename, ".gif"))
        strcpy(filetype, "image/gif");
    else if (strstr(filename, ".jpg"))
        strcpy(filetype, "image/jpeg");
    else
        strcpy(filetype, "text/plain");
}

void request_serve_dynamic(int fd, char *filename, char *cgiargs)
{
    char buf[MAXBUF], *argv[] = {NULL};

    // The server does only a little bit of the header.
    // The CGI script has to finish writing out the header.
    sprintf(buf, ""
                 "HTTP/1.0 200 OK\r\n"
                 "Server: OSTEP WebServer\r\n");

    if (write_to_client(fd, buf, strlen(buf)) < 0)
        return;

    if (fork_or_die() == 0)
    {                                              // child
        setenv_or_die("QUERY_STRING", cgiargs, 1); // args to cgi go here
        dup2_or_die(fd, STDOUT_FILENO);            // make cgi writes go to socket (not screen)
        extern char **environ;                     // defined by libc
        execve_or_die(filename, argv, environ);
    }
    else
    {
        wait_or_die(NULL);
    }
}

void request_serve_static(int fd, char *filename, int filesize)
{
    int srcfd;
    char *srcp, filetype[MAXBUF], buf[MAXBUF];

    request_get_filetype(filename, filetype);

    // put together response
    sprintf(buf, ""
                 "HTTP/1.0 200 OK\r\n"
                 "Server: OSTEP WebServer\r\n"
                 "Content-Length: %d\r\n"
                 "Content-Type: %s\r\n\r\n",
            filesize, filetype);

    // mmap() rejects a length of 0, so an empty file is headers only. Without
    // it the mmap_or_die() assert would abort the whole server.
    if (filesize == 0)
    {
        write_to_client(fd, buf, strlen(buf));
        return;
    }

    srcfd = open_or_die(filename, O_RDONLY, 0);

    // Rather than call read() to read the file into memory, memory-map the file
    srcp = mmap_or_die(0, filesize, PROT_READ, MAP_PRIVATE, srcfd, 0);
    close_or_die(srcfd);

    //  Writes out to the client socket the memory-mapped file; a client that
    //  disconnects mid-transfer just ends this request
    if (write_to_client(fd, buf, strlen(buf)) == 0)
        write_to_client(fd, srcp, filesize);
    munmap_or_die(srcp, filesize);
}

// handle a request
//
// Reads only the request line ("GET /index.html HTTP/1.0") off the socket, for easy logs.
//
// Returns 0 when a request line was read, -1 if the client disconnected
// without sending one (browsers open speculative connections that do this).
int request_parse_line(int fd, char *method, char *uri, char *version)
{
    char buf[MAXBUF];

    method[0] = uri[0] = version[0] = '\0';
    if (readline_from_client(fd, buf, MAXBUF) <= 0)
        return -1;
    sscanf(buf, "%s %s %s", method, uri, version);
    return 0;
}

//
// Serves a request whose first line the caller has already read.
//
void request_serve(int fd, char *method, char *uri)
{
    int is_static;
    struct stat sbuf;
    char filename[MAXBUF], cgiargs[MAXBUF];

    // request_parse_uri() truncates the uri at '?', so work on a copy and
    // leave the caller's string intact for its log lines
    char uri_copy[MAXBUF];
    strcpy(uri_copy, uri);

    // Drain the headers before sending any response, including an error one.
    if (request_read_headers(fd) < 0)
        return; // client went away before finishing its request

    if (strcasecmp(method, "GET"))
    {
        request_error(fd, method, "501", "Not Implemented", "server does not implement this method");
        return;
    }

    // security for ".."
    if (strstr(uri_copy, ".."))
    {
        request_error(fd, uri, "403", "Forbidden", "outside server directory");
        return;
    }

    is_static = request_parse_uri(uri_copy, filename, cgiargs);
    if (stat(filename, &sbuf) < 0)
    {
        request_error(fd, filename, "404", "Not found", "server could not find this file");
        return;
    }

    if (is_static)
    {
        if (!(S_ISREG(sbuf.st_mode)) || !(S_IRUSR & sbuf.st_mode))
        {
            request_error(fd, filename, "403", "Forbidden", "server could not read this file");
            return;
        }
        request_serve_static(fd, filename, sbuf.st_size);
    }
    else
    {
        if (!(S_ISREG(sbuf.st_mode)) || !(S_IXUSR & sbuf.st_mode))
        {
            request_error(fd, filename, "403", "Forbidden", "server could not run this CGI program");
            return;
        }
        request_serve_dynamic(fd, filename, cgiargs);
    }
}
