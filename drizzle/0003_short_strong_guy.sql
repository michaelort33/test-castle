CREATE TABLE `open_play_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`maxPlayers` int NOT NULL,
	`status` enum('active','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `open_play_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `open_play_signups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`playerName` varchar(200) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`email` varchar(320),
	`status` enum('confirmed','waitlisted','cancelled') NOT NULL DEFAULT 'confirmed',
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `open_play_signups_id` PRIMARY KEY(`id`)
);
