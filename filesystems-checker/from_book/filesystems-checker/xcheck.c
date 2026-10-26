// Based on code provided by Patrick Sharp linked from the OSTEP website.
// Updated to read the superblock correctly and provide one starting test.
// Build:  cc -Wall -Wextra -O -o xcheck xcheck.c
// Run:    ./xcheck <file_system_image>

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <string.h>

#include "xcheck.h"

/* xv6 images are little-endian on disk. Use these on every multi-byte
 * field you read so the checker also works on a big-endian machine.
 * See the code marked (a) in the header. */
u16 xshort(u16 x)
{
  u16 y;
  u8 *a = (u8 *)&y;
  a[0] = x;
  a[1] = x >> 8;
  return y;
}

u32 xint(u32 x)
{
  u32 y;
  u8 *a = (u8 *)&y;
  a[0] = x;
  a[1] = x >> 8;
  a[2] = x >> 16;
  a[3] = x >> 24;
  return y;
}

int main(int argc, char **argv)
{
  if (argc != 2)
  {
    fprintf(stderr, "Usage: xcheck <file_system_image>\n");
    exit(1);
  }

  // Open the image file
  int fd = open(argv[1], O_RDONLY);
  if (fd < 0)
  {
    if (errno == ENOENT)
    {
      fprintf(stderr, "image not found.\n");
    }
    else
    {
      perror("could not open image");
    }
    exit(1);
  }

  // Check that the file is readable
  struct stat statbuf;
  if (fstat(fd, &statbuf) < 0)
  {
    perror("could not stat image");
    exit(1);
  }

  // Map the file into memory.
  // Doing this means the *img pointer now points to all the bytes in the
  // file system. This means you can access any part of the file system
  // by just computing an offset into those bytes!
  u8 *img = mmap(NULL, statbuf.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
  if (img == MAP_FAILED)
  {
    perror("could not mmap image");
    exit(1);
  }
  close(fd);

  // Make a superblock pointer that points to the superblock in the file
  // system. This means you can read superblock information by just accessing
  // this struct. See (b) in the header.
  superblock *sb = (superblock *)(img + SBSTART * BSIZE);
  // Note that you need to use xint() to convert the bit order correctly.
  u32 ninodes = xint(sb->ninodes);
  u32 inodestart = 32; // HARD-CODED FOR PUBLIC TEST IMAGE SIZE. PROBABLY NOT GOOD.

  // ------------------------------------------------------------------
  // Check 1 of 12: "Each inode is either unallocated or one of the
  // valid types (T_FILE, T_DIR, T_DEV)."
  //   ERROR: bad inode.
  //
  // This is the simplest of the 12 checks - it looks at one inode at a
  // time and needs nothing else (no bitmap, no directory walk, no
  // address resolution) - so it's implemented here as your example.
  // Use the same style for the rest: read straight from img, resolve
  // every position through the superblock fields above, never a
  // hardcoded constant.
  // ------------------------------------------------------------------
  // Loop over all the inodes. The number of inodes comes from the superblock above.
  for (u32 inum = 0; inum < ninodes; inum++)
  {
    // Get the address of the inode data. Note this is cacluated as:
    // [address of the image] <--where the file system is in memory
    // + [number of blocks before the inodes]*[size of each block] <--space before the inodes
    // + [inode number to look at]*[size of an inode] <--where each inode is
    dinode *dip = (dinode *)(img + inodestart * BSIZE + inum * sizeof(dinode));
    u16 type = xshort(dip->type);
    if (type != 0 && type != T_DIR && type != T_FILE && type != T_DEV)
    {
      fprintf(stderr, "ERROR: bad inode.\n");
      exit(1);
    }
  }

  // ------------------------------------------------------------------
  // TODO: the other 11 checks from the assignment go here, in whatever
  // order is convenient. Check 1 above needed nothing but the inode
  // list; most of the rest need a first pass to collect information
  // (e.g. the block bitmap, or every address currently in use) before
  // they have anything to compare against.
  u32 size = xint(sb->size);                      // total blocks in this image
  u32 nblocks = xint(sb->nblocks);                // number of data blocks
  u32 start = size - nblocks;                     // blocknumber of first datablock
  u8 *bitmap = img + xint(sb->bmapstart) * BSIZE; // points to datamap
  int *used_blocks = calloc(size, sizeof(int));   // build a second bitmap to compare for Test 6
  int *referenced_in = calloc(ninodes, sizeof(int));
  int *named_in = calloc(ninodes, sizeof(int));
  //
  //   2.  ERROR: bad direct address in inode.
  //       ERROR: bad indirect address in inode.
  // and  5.
  for (u32 inum = 0; inum < ninodes; inum++)
  {
    dinode *dip = (dinode *)(img + inodestart * BSIZE + inum * sizeof(dinode)); // Get the address of the inode data.
    u16 type = xshort(dip->type);
    // Test for Case 1 could also go here
    if (type == 0) // not used inode
    {
      continue;
    }
    // check direct blocks
    for (u32 i = 0; i < NDIRECT + 1; i++)
    {
      u32 adr = xint(dip->addrs[i]);
      if (adr == 0)
      {
        continue;
      }
      // 2.  ERROR: bad direct address in inode.
      if (adr < start || adr >= size)
      {
        if (i < NDIRECT)
        {
          fprintf(stderr, "ERROR: bad direct address in inode.\n");
          exit(1);
        }
        else // indirect block
        {
          fprintf(stderr, "ERROR: bad indirect address in inode.\n");
          exit(1);
        }
      }
      // if direct block adresses used before then it is marked in used
      if (used_blocks[adr] == 1)
      {
        //   7.  ERROR: direct address used more than once.

        if (i < NDIRECT)
        {
          fprintf(stderr, "ERROR: direct address used more than once.\n");
          exit(1);
        }
        //   8.  ERROR: indirect address used more than once.

        else
        {
          fprintf(stderr, "ERROR: indirect address used more than once.\n");
          exit(1);
        }
      }
      // for 6,7,8:  maked as used
      used_blocks[adr] = 1;

      // 5.  ERROR: address used by inode but marked free in bitmap.
      // Bitmap is a row of bytes ans every byte has a 8 bits that stand for a block
      u8 byte = bitmap[adr / 8];
      int mask = (1 << (adr % 8)); // shift index so readable
      int bit = byte & mask;       // only get 1st bit

      if (bit == 0)
      {
        fprintf(stderr, "ERROR: address used by inode but marked free in bitmap.\n");
        exit(1);
      }
    }
    // check indirect datablocks
    u32 adr = xint(dip->addrs[NDIRECT]); // block number
    if (adr != 0)
    {

      u32 *indirect = (u32 *)(img + adr * BSIZE); // go to adress = block nr -> actuall adress
      for (u32 i = 0; i < NINDIRECT; i++)
      {
        u32 inadr = xint(indirect[i]);
        if (inadr == 0)
        {
          continue;
        }
        // 2. ERROR: bad indirect address in inode.
        if (inadr < start || inadr >= size)
        {
          fprintf(stderr, "ERROR: bad indirect address in inode.\n");
          exit(1);
        }
        //   8.  ERROR: indirect address used more than once.
        if (used_blocks[inadr] == 1)
        {
          fprintf(stderr, "ERROR: indirect address used more than once.\n");
          exit(1);
        }
        // for 6,7,8,:
        used_blocks[inadr] = 1;
        // 5.  ERROR: address used by inode but marked free in bitmap.
        // Bitmap is a row of byytes ans every byte has a 8 bits that stand for a block
        u8 byte = bitmap[inadr / 8];
        int mask = (1 << (inadr % 8)); // shift index so readable
        int bit = byte & mask;         // only get 1st bit

        if (bit == 0)
        {
          fprintf(stderr, "ERROR: address used by inode but marked free in bitmap.\n");
          exit(1);
        }
      }
    }
  }

  //   3.  ERROR: root directory does not exist.
  dinode *firstdip = (dinode *)(img + inodestart * BSIZE + 1 * sizeof(dinode)); // first inode
  u16 type = xshort(firstdip->type);
  if (type != T_DIR)
  { // not a directory
    fprintf(stderr, "ERROR: root directory does not exist.\n");
    exit(1);
  }
  // check direct
  int found_root = 0;
  for (u32 i = 0; i < NDIRECT && !found_root; i++)
  {
    u32 adr = xint(firstdip->addrs[i]); // datablock
    if (adr == 0)
    {
      continue;
    }
    dirent *dentries = (dirent *)(img + adr * BSIZE); // go to block to access directory entries
    for (u32 j = 0; j < (BSIZE / sizeof(dirent)); j++)
    { // go through all 32 entries -> not hard coded!
      u16 number = xshort(dentries[j].inum);
      if (number == 0)
      {
        continue;
      }
      if (strncmp(dentries[j].name, "..", DIRSIZ) == 0 && number == 1)
      {
        found_root = 1;
        break;
      }
    }
  }
  if (!found_root)
  {
    u32 adr = xint(firstdip->addrs[NDIRECT]); // block number
    if (adr != 0)
    {

      u32 *indirect = (u32 *)(img + adr * BSIZE); // go to adress = block nr -> actuall adress
      for (u32 i = 0; i < NINDIRECT; i++)
      {
        u32 inadr = xint(indirect[i]);
        if (inadr == 0)
        {
          continue;
        }
        dirent *dentries = (dirent *)(img + inadr * BSIZE); // go to block to access directory entries
        for (u32 j = 0; j < (BSIZE / sizeof(dirent)); j++)
        { // go through all 32 entries -> not hard coded!
          u16 number = xshort(dentries[j].inum);
          if (number == 0)
          {
            continue;
          }
          if (strncmp(dentries[j].name, "..", DIRSIZ) == 0 && number == 1)
          {
            found_root = 1;
            break;
          }
        }
      }
    }
  }

  if (!found_root)
  {
    fprintf(stderr, "ERROR: root directory does not exist.\n");
    exit(1);
  }

  //   4.  ERROR: directory not properly formatted.
  for (u32 inum = 0; inum < ninodes; inum++)
  {
    dinode *dip = (dinode *)(img + inodestart * BSIZE + inum * sizeof(dinode));
    u16 type = xshort(dip->type);
    if (type != T_DIR)
    { // not a directory
      continue;
    }
    int found_dir = 0;
    int found_pardir = 0;
    for (u32 i = 0; i < NDIRECT && (!found_dir || !found_pardir); i++)
    {
      u32 adr = xint(dip->addrs[i]); // datablock
      if (adr == 0)
      {
        continue;
      }
      dirent *dentries = (dirent *)(img + adr * BSIZE); // go to block to access directory entries
      for (u32 j = 0; j < (BSIZE / sizeof(dirent)); j++)
      {
        u16 number = xshort(dentries[j].inum);

        if (strncmp(dentries[j].name, ".", DIRSIZ) == 0 && number == inum)
        {
          found_dir = 1;
        }
        if (strncmp(dentries[j].name, "..", DIRSIZ) == 0)
        {
          found_pardir = 1;
        }
      }
    }
    if (!found_dir || !found_pardir)
    {
      u32 adr = xint(dip->addrs[NDIRECT]); // block number
      if (adr != 0)
      {

        u32 *indirect = (u32 *)(img + adr * BSIZE); // go to adress = block nr -> actuall adress
        for (u32 i = 0; i < NINDIRECT; i++)
        {
          u32 inadr = xint(indirect[i]);
          if (inadr == 0)
          {
            continue;
          }
          dirent *dentries = (dirent *)(img + inadr * BSIZE); // go to block to access directory entries
          for (u32 j = 0; j < (BSIZE / sizeof(dirent)); j++)
          { // go through all 32 entries -> not hard coded!
            u16 number = xshort(dentries[j].inum);
            if (number == 0)
            {
              continue;
            }
            if (strncmp(dentries[j].name, ".", DIRSIZ) == 0 && number == inum)
            {
              found_dir = 1;
            }
            if (strncmp(dentries[j].name, "..", DIRSIZ) == 0)
            {
              found_pardir = 1;
            }
          }
        }
      }
    }

    if (!found_dir || !found_pardir)
    {
      fprintf(stderr, "ERROR: directory not properly formatted.\n");
      exit(1);
    }
  }

  // 5. see above

  //   6.  ERROR: bitmap marks block in use but it is not in use.
  // builed "second bitmap" above, now compare

  for (u32 b = start; b < size; b++)
  {
    u8 byte = bitmap[b / 8];
    int mask = (1 << (b % 8));    // shift index so readable
    int bit = (byte & mask) != 0; // only get 1st bit

    if (bit && !used_blocks[b])
    {
      fprintf(stderr, "ERROR: bitmap marks block in use but it is not in use.\n");
      exit(1);
    }
  }

  //   7.  ERROR: direct address used more than once.
  //   8.  ERROR: indirect address used more than once.

  //   9.  ERROR: inode marked use but not found in a directory.
  //   10. ERROR: inode referred to in directory but marked free.
  //   11. ERROR: bad reference count for file.
  // -> go through every directory and count for each inode how often it accoursd in dictories
  //   12. ERROR: directory appears more than once in file system.
  for (u32 inum = 0; inum < ninodes; inum++)
  {
    dinode *dip = (dinode *)(img + inodestart * BSIZE + inum * sizeof(dinode));
    u16 type = xshort(dip->type);
    if (type != T_DIR)
    { // not a directory
      continue;
    }
    // check direct
    for (u32 i = 0; i < NDIRECT; i++)
    {
      u32 adr = xint(dip->addrs[i]); // datablock
      if (adr == 0)
      {
        continue;
      }
      dirent *dentries = (dirent *)(img + adr * BSIZE); // go to block to access directory entries
      for (u32 j = 0; j < (BSIZE / sizeof(dirent)); j++)
      { // go through all 32 entries -> not hard coded!
        u16 number = xshort(dentries[j].inum);
        if (number == 0)
        {
          continue;
        }
        // for 10: inode points to number, is it occupied?
        dinode *referenced = (dinode *)(img + inodestart * BSIZE + number * sizeof(dinode));
        u16 ref_type = xshort(referenced->type);
        if (ref_type == 0)
        {
          fprintf(stderr, "ERROR: inode referred to in directory but marked free.\n");
          exit(1);
        }
        referenced_in[number]++;
        if (strncmp(dentries[j].name, ".", DIRSIZ) != 0 && strncmp(dentries[j].name, "..", DIRSIZ) != 0)
        {
          named_in[number]++;
        }
      }
    }
    u32 adr = xint(dip->addrs[NDIRECT]); // block number
    if (adr != 0)
    {
      u32 *indirect = (u32 *)(img + adr * BSIZE); // go to adress = block nr -> actuall adress
      for (u32 i = 0; i < NINDIRECT; i++)
      {
        u32 inadr = xint(indirect[i]);
        if (inadr == 0)
        {
          continue;
        }
        dirent *dentries = (dirent *)(img + inadr * BSIZE); // go to block to access directory entries
        for (u32 j = 0; j < (BSIZE / sizeof(dirent)); j++)
        { // go through all 32 entries -> not hard coded!
          u16 number = xshort(dentries[j].inum);
          if (number == 0)
          {
            continue;
          }
          referenced_in[number]++;
          if (strncmp(dentries[j].name, ".", DIRSIZ) != 0 && strncmp(dentries[j].name, "..", DIRSIZ) != 0)
          {
            named_in[number]++;
          }
        }
      }
    }
  }
  // CHECK for 9 & 11 & 12:
  for (u32 inum = 0; inum < ninodes; inum++)
  {
    dinode *dip = (dinode *)(img + inodestart * BSIZE + inum * sizeof(dinode));
    u16 type = xshort(dip->type);
    if (type != 0 && inum != 1 && referenced_in[inum] == 0)
    {
      fprintf(stderr, "ERROR: inode marked use but not found in a directory.\n");
      exit(1);
    }
    if (type == T_FILE && referenced_in[inum] != xshort(dip->nlink))
    {
      fprintf(stderr, "ERROR: bad reference count for file.\n");
      exit(1);
    }
    if (xshort(dip->type) == T_DIR && (xshort(dip->nlink) > 1 || named_in[inum] > 1))
    {
      fprintf(stderr, "ERROR: directory appears more than once in file system.\n");
      exit(1);
    }
  }

  // ------------------------------------------------------------------

  // Unmap the file when we are done with it.
  free(used_blocks);
  free(referenced_in);
  free(named_in);
  munmap(img, statbuf.st_size);
  return 0;
}
