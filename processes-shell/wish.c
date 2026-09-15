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

    char *cursor = buffer;
    char *token;

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
        execv("/usr/bin/ls", args);
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
        if (characters == -1)
        {
            free(buffer);
            exit(0);
        }

        char *args[100];

        int arg_count = tokenizer(buffer, args, 100);

        // empty command
        if (arg_count == 0)
        {
            continue;
        }

        exec_command(args);

        // batch mode
    }
}
