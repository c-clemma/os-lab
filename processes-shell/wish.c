#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[])
{
    // printf("%s\n",argv[1]);
    FILE *fptr;
    // Declare the character array
    // for the data to be read from file
    char data[50];
    fptr = fopen(argv[1], "r");
    if (fptr == NULL)
    {
        // normal wish function
        // printf("batch.txt file failed to open.");
    }
    else
    {
        // printf("The file is now opened.\n");
        // Read the data from the file
        // using fgets() method
        while (fgets(data, 50, fptr) != NULL)
        {
            // Print the data
            printf("%s", data);
        }
        // Closing the file using fclose()
        fclose(fptr);
    }
    return 0;
}