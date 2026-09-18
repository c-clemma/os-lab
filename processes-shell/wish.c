#include <stdio.h>
#include <unistd.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>

char **path = NULL;
int path_count = 0;

/**
 * Prints the standard shell error message to stderr.
 */
void error()
{
    char error_message[30] = "An error has occurred\n";
    write(STDERR_FILENO, error_message, strlen(error_message));
}

/**
 * Splits the input buffer into individual arguments.
 *
 * @param buffer   The input string to tokenize.
 * @param args     Array where the resulting arguments are stored.
 * @param max_args Maximum number of arguments.
 * @return The number of arguments found.
 */
int tokenizer(char *buffer, char *args[], int max_args)
{
    // TODO: add "<" and "&" as separators
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

/**
 * Searches for a command in the configured paths.
 *
 * @param command The command to search for.
 * @return The full path to the executable if found,
 *         otherwise NULL.
 */
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
    return NULL;
}

/**
 * Checks whether the entered command is a built-in shell command.
 *
 * Handles the built-in commands "exit", "cd", and "path".
 * If a built-in command is found, it is executed directly.
 *
 * @param args Array containing the command and its arguments.
 * @param arg_count Number of arguments in args.
 * @return true if the command was a built-in command,
 *         false otherwise.
 */
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
    }
    return false;
}

/**
 * Executes a command using fork() and execv().
 *
 * @param args array containing
 *             the command and its arguments.
 */
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
        char *command = search_path(args[0], arg_count);
        if (command == NULL)
        {
            error();
            exit(1); // the child need to be stopped
        }
        execv(command, args);
        error();
    }
    else
    {
        // printf("Child process finsihed\n");
        waitpid(rc, NULL, 0);
    }
}

int main(int argc, char *argv[])
{
    path = malloc(2 * sizeof(char *));
    path[0] = "/bin";
    path[1] = "/usr/bin";
    path_count = 2;

    // cause getline allocates memory dynamically
    char *buffer = NULL;
    size_t bufsize = 0;

    // Batch-mode: if an additional argument was given
    if (argv[1] != NULL)
    {
        FILE *fptr;
        fptr = fopen(argv[1], "r");
        if (argv[2] != NULL || fptr == NULL)
        {
            exit(1);
        }
        // TODO: should be a function as it is almost the same
        ssize_t characters = getline(&buffer, &bufsize, fptr);
        while (characters != -1) // until EOF
        {
            // printf("%zu characters were read.\n", characters);
            // printf("Command line:\n%s", buffer);
            char *args[100];                              // array 100 elements, that each are a pointer to a char
            int arg_count = tokenizer(buffer, args, 100); // amount of tokens
            // printf("%d number of arguments\n",arg_count);

            if (arg_count != 0)
            {
                // printf("Executing %p\n",args);
                if (!checkbuildin(args, arg_count))
                {
                    exec_command(args, arg_count);
                }
            }

            characters = getline(&buffer, &bufsize, fptr);
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