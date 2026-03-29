CREATE TABLE `reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`duration` int NOT NULL,
	`price` int NOT NULL,
	`sessionName` varchar(100),
	`contactPhone` varchar(20) NOT NULL,
	`contactEmail` varchar(320),
	`confirmationCode` varchar(10) NOT NULL,
	`status` enum('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tournament_registrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tournamentId` int NOT NULL,
	`userId` int NOT NULL,
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tournament_registrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`date` date NOT NULL,
	`startTime` varchar(5),
	`endTime` varchar(5),
	`details` text,
	`maxParticipants` int,
	`winnerId` int,
	`status` enum('upcoming','in_progress','completed','cancelled') NOT NULL DEFAULT 'upcoming',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tournaments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','guest','unapproved_guest') NOT NULL DEFAULT 'unapproved_guest';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);