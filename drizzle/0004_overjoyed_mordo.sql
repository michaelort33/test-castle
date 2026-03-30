ALTER TABLE `reservations` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `tournament_registrations` ADD CONSTRAINT `idx_tournament_user` UNIQUE(`tournamentId`,`userId`);--> statement-breakpoint
ALTER TABLE `open_play_signups` ADD CONSTRAINT `open_play_signups_sessionId_open_play_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `open_play_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournament_registrations` ADD CONSTRAINT `tournament_registrations_tournamentId_tournaments_id_fk` FOREIGN KEY (`tournamentId`) REFERENCES `tournaments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournament_registrations` ADD CONSTRAINT `tournament_registrations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tournaments` ADD CONSTRAINT `tournaments_winnerId_users_id_fk` FOREIGN KEY (`winnerId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_open_play_sessions_date_status` ON `open_play_sessions` (`date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_open_play_signups_session_status` ON `open_play_signups` (`sessionId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_reservations_date_status` ON `reservations` (`date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_reservations_userId` ON `reservations` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_tournaments_status` ON `tournaments` (`status`);