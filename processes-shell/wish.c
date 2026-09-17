#include <stdio.h>
#include <unistd.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>

char **path = NULL;
int path_count = 0;
// path count
void error()
{
    char error_message[30] = "An error has occurred\n";
    write(STDERR_FILENO, error_message, strlen(error_message));
}
// char *path[100];

int tokenizer(char *buffer, char *args[], int max_args)
{
    // TODO: add ">" and "&" as separators
    int arg_count = 0;

    char *cursor = buffer; // start at beginning before going to next separator
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

char *search_path(char *command, int arg_count)
{

    for (int i = 0; i < path_count; i++)
    {
        size_t size = strlen(path[i]) + strlen(command) + 2;
        char *buffer = malloc(size);
        snprintf(buffer, size, "%s/%s", path[i], command);
        // char path_exec = path[i] +command;
        if (access(buffer, X_OK) == 0)
        {
            return buffer;
        }
        free(buffer);
    }

    /* strcpy(path, "/bin/");
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
    } */
    return NULL;
}

bool checkbuildin(char *args[], int arg_count)
{

    if (strcmp("exit", args[0]) == 0)
    {
        if (arg_count == 1)
        {
            exit(0);
        }
        else
        {
            // error here
            error();
            return true;
        }
    }

    if (strcmp("cd", args[0]) == 0)
    {
        if (arg_count == 2)
        {
            if (chdir(args[1]) != 0)
            {
                error();
            }
        }
        else
        {
            error();
        }
        return true;
    }

    if (strcmp("path", args[0]) == 0)
    {

        // clear path completly TODO and malloc with size i need
        path_count = arg_count - 1;
        path = malloc(path_count * sizeof(char *));

        for (int i = 0; i < path_count; i++)
        {
            path[i] = strdup(args[i + 1]);
        }

        return true;
        // error here
        // perror("wrong amount of arguments");
    }
    return false;
}

// printf("%s\n", path);

void exec_command(char *args[], int arg_count)
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
        // check if exit
        // check if path
        // check if cd
        // checkbuildin(args, arg_count);
        char *command = search_path(args[0], arg_count);
        if (command == NULL)
        {
            error();
            _exit(1); // the child need to be stopped
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



int main(int argc, char *argv[])
{
    path = malloc(sizeof(char *));
    path[0] = "/bin";
    // path[1] = "/bin/usr";
    path_count = 1;

    // cause getline allocates memory dynamically
    char *buffer = NULL;
    size_t bufsize = 0;

    if (argc > 2)
    {
        error();
        exit(1);
    }
    if (argv[1] != NULL)
    {
        FILE *fptr;
        fptr = fopen(argv[1], "r");
        if (fptr==NULL)
        {
            error();
            exit(1);
        }
        // TODO: should be a function as it is almost the same
        for (ssize_t characters = getline(&buffer, &bufsize, fptr); characters!=-1; characters = getline(&buffer, &bufsize, fptr))
        {
            // printf("%zu characters were read.\n", characters);
            // printf("Command line:\n%s", buffer);
            // printf("hello world (pid:%d)\n", (int) getpid());
            char *args[100]; // array 100 elements, that each are a pointer to a char
            int arg_count = tokenizer(buffer, args, 100); // amount of tokens
            // printf("%d number of arguments\n",arg_count);

            if (arg_count !=0)
            {
                // printf("Executing %p\n",args);
                if (!checkbuildin(args, arg_count))
                {
                    // TODO: get working execution
                    exec_command(args, arg_count);
                }
            }

            // characters = getline(&buffer, &bufsize, fptr);
            // printf("\n\n");
        }
        free(buffer);
        fclose(fptr);

    }
    else // Normal mode
    {
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

            if (checkbuildin(args, arg_count))
            {
                continue;
            }
            exec_command(args, arg_count);
        }
    }
}