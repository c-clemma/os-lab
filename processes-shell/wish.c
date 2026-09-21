#include <stdio.h>
#include <unistd.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <fcntl.h>

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

int redirectioner(char *buffer, char *args[], int max_args, char **outputfile)
{
    char *cursor = buffer;
    char *left = strsep(&cursor, ">"); // left side of >
    char *right = cursor;              // right side of >
    if (right == NULL)                 // right is empty
    {
        *outputfile = NULL;
        return tokenizer(left, args, max_args);
    }
    if (strchr(right, '>')) // right have more '>'
    {
        error();
        return 0;
    }

    int r_tokens = tokenizer(right, args, max_args);
    if (r_tokens == 1)
    {
        *outputfile = args[0];
    }
    else // wrong right side
    {
        error();
        return 0;
    }

    int l_tokens = tokenizer(left, args, max_args);
    if (l_tokens == 0) // empty left side
    {
        error();
        return 0;
    }
    return l_tokens;
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
int exec_command(char *args[], int arg_count, char *outputfile)
{
    int rc = fork();
    if (rc < 0)
    {
        // fork failed: exit
        error();
        exit(1);
    }
    else if (rc == 0)
    {
        // child (new process)
        char *command = search_path(args[0], arg_count);
        if (outputfile != NULL)
        {
            // set return to output file
            close(STDOUT_FILENO);
            int fd = open(outputfile, O_CREAT | O_WRONLY | O_TRUNC, 0644);
            dup2(STDOUT_FILENO, STDERR_FILENO);
            if (fd < 0)
            {
                error();
                _exit(1);
            }
        }
        if (command == NULL)
        {
            error();
            _exit(1); // the child need to be stopped
        }
        execv(command, args);
        error();
        _exit(1);
    }
    return rc;
}

// helper function to merge checkbuildin and exec_command
int execute_line(char *buffer)
{
    char *args[100];
    char *outfile;
    int max_args = 100;
    int arg_count = redirectioner(buffer, args, max_args, &outfile); // amount of tokens
    if (arg_count > 0)
    {
        if (!checkbuildin(args, arg_count))
        {
            int rc = exec_command(args, arg_count, outfile);
            return rc;
        }
    }
    return 0;
}

// separate commands by & and calls function to execute them
void parallelize(char *buffer)
{
    pid_t pids[100];
    int n = 0;
    char *cursor = buffer;
    char *token;

    while ((token = strsep(&cursor, "&")) != NULL)
    {
        int pid = execute_line(token);
        if (pid > 0)
            pids[n++] = pid;
    }
    for (int i = 0; i < n; i++)
    {
        waitpid(pids[i], NULL, 0);
    }
}

int main(int argc, char *argv[])
{
    path = malloc(sizeof(char *));
    path[0] = "/bin";
    path_count = 1;

    // cause getline allocates memory dynamically
    char *buffer = NULL;
    size_t bufsize = 0;

    if (argc > 2) // check for too many arguments
    {
        error();
        exit(1);
    }
    if (argv[1] != NULL) // Batch mode
    {
        FILE *fptr;
        fptr = fopen(argv[1], "r");
        if (fptr == NULL) // file could not be open
        {
            error();
            exit(1);
        }
        for (ssize_t characters = getline(&buffer, &bufsize, fptr); characters != -1; characters = getline(&buffer, &bufsize, fptr))
        {
            parallelize(buffer);
        }
        free(buffer);
        fclose(fptr);
    }
    else // Normal mode
    {
        for (ssize_t characters = getline(&buffer, &bufsize, stdin); characters != -1; characters = getline(&buffer, &bufsize, stdin))
        {
            printf("wish> ");
            parallelize(buffer);
        }
        free(buffer);
    }
}