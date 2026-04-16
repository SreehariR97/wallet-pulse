CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text,
	`amount` real NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `budgets_user_idx` ON `budgets` (`user_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '📦' NOT NULL,
	`color` text DEFAULT '#6366F1' NOT NULL,
	`type` text NOT NULL,
	`budget_limit` real,
	`is_default` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`description` text NOT NULL,
	`notes` text,
	`date` integer NOT NULL,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`is_recurring` integer DEFAULT false NOT NULL,
	`recurring_frequency` text,
	`tags` text,
	`receipt_url` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tx_user_date_idx` ON `transactions` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `tx_user_category_idx` ON `transactions` (`user_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `tx_user_type_idx` ON `transactions` (`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`monthly_budget` real,
	`theme` text DEFAULT 'dark' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);