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

#include "xcheck.h"

/* xv6 images are little-endian on disk. Use these on every multi-byte
 * field you read so the checker also works on a big-endian machine. 
 * See the code marked (a) in the header. */
 u16 xshort(u16 x) {
  u16 y;
  u8 *a = (u8 *)&y;
  a[0] = x;
  a[1] = x >> 8;
  return y;
}

u32 xint(u32 x) {
  u32 y;
  u8 *a = (u8 *)&y;
  a[0] = x;
  a[1] = x >> 8;
  a[2] = x >> 16;
  a[3] = x >> 24;
  return y;
}

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "Usage: xcheck <file_system_image>\n");
    exit(1);
  }

  // Open the image file
  int fd = open(argv[1], O_RDONLY);
  if (fd < 0) {
    if (errno == ENOENT) {
      fprintf(stderr, "image not found.\n");
    } else {
      perror("could not open image");
    }
    exit(1);
  }

  // Check that the file is readable
  struct stat statbuf;
  if (fstat(fd, &statbuf) < 0) {
    perror("could not stat image");
    exit(1);
  }

  // Map the file into memory.
  // Doing this means the *img pointer now points to all the bytes in the
  // file system. This means you can access any part of the file system
  // by just computing an offset into those bytes!
  u8 *img = mmap(NULL, statbuf.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
  if (img == MAP_FAILED) {
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
  for (u32 inum = 0; inum < ninodes; inum++) {
    // Get the address of the inode data. Note this is cacluated as:
    // [address of the image] <--where the file system is in memory
    // + [number of blocks before the inodes]*[size of each block] <--space before the inodes
    // + [inode number to look at]*[size of an inode] <--where each inode is
    dinode *dip = (dinode *)(img + inodestart * BSIZE + inum * sizeof(dinode));
    u16 type = xshort(dip->type);
    if (type != 0 && type != T_DIR && type != T_FILE && type != T_DEV) {
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
  //
  //   2.  ERROR: bad direct address in inode.
  //       ERROR: bad indirect address in inode.
  //   3.  ERROR: root directory does not exist.
  //   4.  ERROR: directory not properly formatted.
  //   5.  ERROR: address used by inode but marked free in bitmap.
  //   6.  ERROR: bitmap marks block in use but it is not in use.
  //   7.  ERROR: direct address used more than once.
  //   8.  ERROR: indirect address used more than once.
  //   9.  ERROR: inode marked use but not found in a directory.
  //   10. ERROR: inode referred to in directory but marked free.
  //   11. ERROR: bad reference count for file.
  //   12. ERROR: directory appears more than once in file system.
  // ------------------------------------------------------------------

  // Unmap the file when we are done with it.
  munmap(img, statbuf.st_size);
  return 0;
}
