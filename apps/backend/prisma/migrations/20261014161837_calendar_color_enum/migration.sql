/*
  Warnings:

  - The `color` column on the `Calendar` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "CalendarColor" AS ENUM ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink');

-- AlterTable
ALTER TABLE "Calendar" DROP COLUMN "color",
ADD COLUMN     "color" "CalendarColor";
