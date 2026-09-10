#include <stdio.h>
#include <unistd.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void)
{
    while (true)
    {
        printf("wish> ");

        char *buffer;
        size_t bufsize = 32;
        // size_t characters;

        char *token;

        // expalin this line of code, i dont know yet
        buffer = (char *)malloc(bufsize * sizeof(char));

        if (buffer == NULL)
        {
            perror("Unable to allocate buffer");
            exit(1);
        }

        // printf("Type something: ");
        getline(&buffer, &bufsize, stdin);
        // printf("%zu characters were read.\n", characters);
        printf("You typed: %s\n", buffer);

        for (unsigned int j = 1; (token = strsep(&buffer, " ")); j++)
        {
            printf("%s\n", token);

            // somehow needs to identify what is a comand, what is an argument

            int rc = fork();
            if (rc < 0)
            {
                // fork failed; exit
                fprintf(stderr, "fork failed\n");
                exit(1);
            }
            else if (rc == 0)
            {
                char *args[] = {"ls", NULL};
                // child (new process)
                printf("hello, I am child that will execute that command '%s' in the future\n", token);
                execv("/usr/bin/ls", args);
            }
            else
            {
                wait(NULL);
                printf("Child process finsihed\n");
            }
        }

        // put input in pieces with strsep

        // returns a pointer to the token

        // batch mode

        // if end-of-file marker: exit(0);

        return 0;
    }
}
