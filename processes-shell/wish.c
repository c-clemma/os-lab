#include <stdio.h>
#include <unistd.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>

int tokenizer(char *buffer, char *args[], int max_args)
{
    int arg_count = 0;

    char *cursor = buffer; // start at beginning before going to next sperator
    char *token;           // token is a pointer to a char

    while ((token = strsep(&cursor, " \t\n")) != NULL)
    {
        // " "
        if (strlen(token) == 0)
        {
            continue;
        }
        args[arg_count] = token;
        arg_count++;
    }

    args[arg_count] = NULL;
    return arg_count;
}

char *search_path(char *command)
{
    char *path = malloc(100);
    strcpy(path, "/bin/");
    strcat(path, command);
    if (access(path, X_OK) == 0)
    {
        return path;
    }
    strcpy(path, "/bin/usr");
    strcat(path, command);

    if (access(path, X_OK) == 0)
    {
        return path;
    }
    free(path);
    return NULL;
}

// printf("%s\n", path);

void exec_command(char *args[])
{
    int rc = fork();
    if (rc < 0)
    {
        // fork failed: exit
        fprintf(stderr, "fork failed\n");
        exit(1);
    }
    else if (rc == 0)
    {
        // child (new process)
        // printf("hello, I am child that will execute that command '%s' in the future\n", token);
        // TODO get_path();
        // exec(args[0], args)
        // path: need to add args[0];
        char *command = search_path(args[0]);
        if (command == NULL)
        {
            fprintf(stderr, "Command not found\n");
            return;
        }
        execv(command, args);
        exit(1);
    }
    else
    {
        // printf("Child process finsihed\n");
        waitpid(rc, NULL, 0);
    }
}

int main(void)
{
    // cause getline allocates memory dynamically
    char *buffer = NULL;
    size_t bufsize = 0;

    while (true)
    {
        printf("wish> ");

        // printf("Type something: ");
        ssize_t characters = getline(&buffer, &bufsize, stdin);
        // printf("%zu characters were read.\n", characters);
        // printf("You typed: %s\n", buffer);

        // if end-of-file marker : exit(0);
        // EOF = a signal or condition that tells a computer program no more data remains in a file or input stream
        // fail or eof the getline() retruns -1
        if (characters == -1)
        {
            free(buffer); // free the memory after all (see man page)
            exit(0);
        }

        char *args[100]; // array 100 elements, that each are a pointer to a char
        // to split in tokens, need: buffer, args and the limit of 100
        int arg_count = tokenizer(buffer, args, 100); // amount of tokens

        // empty command
        if (arg_count == 0)
        {
            continue;
        }

        exec_command(args);

        // batch mode
    }
}
