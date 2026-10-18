/*
  Warnings:

  - You are about to drop the column `color` on the `Calendar` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Calendar" DROP COLUMN "color";

-- DropEnum
DROP TYPE "CalendarColor";
