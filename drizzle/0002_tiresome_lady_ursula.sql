ALTER TABLE `reservations` ADD `fullName` varchar(200);--> statement-breakpoint
ALTER TABLE `reservations` ADD `notifyBeforeReservation` boolean DEFAULT true NOT NULL;