-- DROP AND CREATE DATABASE
DROP DATABASE IF EXISTS resqzone;
CREATE DATABASE resqzone;
USE resqzone;

-- ===========================================
-- USERS TABLE
-- ===========================================
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL COMMENT 'Phone number used for login',
    country_code VARCHAR(10) DEFAULT '+44' COMMENT 'International country code',
    email VARCHAR(255) UNIQUE COMMENT 'Optional email address',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender ENUM('male', 'female', 'other') DEFAULT 'other',
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    profile_picture_url TEXT,
    is_phone_verified BOOLEAN DEFAULT FALSE COMMENT 'Marks if phone number is verified',
    role ENUM('user', 'admin', 'moderator') DEFAULT 'user' COMMENT 'Role of the user',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Account active status',
    latitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Latitude for location-based alerts',
    longitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Longitude for location-based alerts',
    created_by BIGINT UNSIGNED DEFAULT NULL COMMENT 'User ID who created this user (admin operations)',
    updated_by BIGINT UNSIGNED DEFAULT NULL COMMENT 'User ID who last updated this user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Soft delete timestamp',
    UNIQUE KEY uniq_phone_per_country (country_code, phone_number),
    INDEX idx_phone_number (phone_number),
    INDEX idx_role (role)
);

INSERT INTO users (
    phone_number, country_code, email, first_name, last_name, date_of_birth, gender,
    address_line1, city, state, postal_code, country, is_phone_verified, role,
    is_active, created_by, updated_by
) VALUES
('9999999999', '+44', 'laura.murphy@example.com', 'Laura', 'Murphy', '2004-08-10', 'male', '13 Example Street', 'Birmingham', 'borough', 'M1 2BB', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7777777777', '+44', 'evacuating.resident@example.com', 'Evacuating', 'Resident', '1995-04-30', 'female', '15 Example Street', 'Leeds', 'town', 'CB1 9II', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('0000000000', '+44', 'community.volunteer@example.com', 'Community', 'Volunteer', '2003-08-19', 'female', '15 Example Street', 'Liverpool', 'city', 'E1 1AA', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('1111111111', '+44', 'local.official@example.com', 'Local', 'Official', '1990-01-29', 'male', '88 Example Street', 'Leeds', 'village', 'S1 6FF', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000004', '+44', 'zoe.campbell@example.com', 'Zoe', 'Campbell', '2010-03-19', 'male', '96 Example Street', 'Oxford', 'borough', 'B1 7GG', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000005', '+44', 'ethan.walker@example.com', 'Ethan', 'Walker', '1998-12-07', 'female', '69 Example Street', 'Liverpool', 'town', 'NG1 8HH', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000006', '+44', 'chloe.wright@example.com', 'Chloe', 'Wright', '1995-09-11', 'male', '18 Example Street', 'Liverpool', 'city', 'S1 6FF', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000007', '+44', 'daniel.hill@example.com', 'Daniel', 'Hill', '2006-11-16', 'female', '92 Example Street', 'Manchester', 'city', 'OX1 0JJ', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000008', '+44', 'sophie.edwards@example.com', 'Sophie', 'Edwards', '1990-02-02', 'female', '21 Example Street', 'Liverpool', 'village', 'LS1 5EE', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000009', '+44', 'ryan.turner@example.com', 'Ryan', 'Turner', '1998-01-08', 'male', '38 Example Street', 'Manchester', 'borough', 'BS1 4DD', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000010', '+44', 'emily.robinson@example.com', 'Emily', 'Robinson', '1996-01-27', 'male', '67 Example Street', 'Manchester', 'city', 'NG1 8HH', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000011', '+44', 'james.hall@example.com', 'James', 'Hall', '1995-11-17', 'female', '14 Example Street', 'Manchester', 'village', 'B1 7GG', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000012', '+44', 'olivia.clark@example.com', 'Olivia', 'Clark', '1996-09-22', 'female', '16 Example Street', 'Birmingham', 'shire', 'B1 7GG', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000013', '+44', 'liam.lewis@example.com', 'Liam', 'Lewis', '1990-01-05', 'female', '43 Example Street', 'Liverpool', 'town', 'OX1 0JJ', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000014', '+44', 'amelia.allen@example.com', 'Amelia', 'Allen', '2007-03-31', 'male', '9 Example Street', 'Manchester', 'town', 'BS1 4DD', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000015', '+44', 'mason.scott@example.com', 'Mason', 'Scott', '1997-10-18', 'male', '13 Example Street', 'Nottingham', 'village', 'CB1 9II', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000016', '+44', 'grace.young@example.com', 'Grace', 'Young', '1999-03-24', 'female', '75 Example Street', 'Bristol', 'borough', 'M1 2BB', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000017', '+44', 'jack.king@example.com', 'Jack', 'King', '1994-02-07', 'female', '75 Example Street', 'Liverpool', 'borough', 'BS1 4DD', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000018', '+44', 'ava.mitchell@example.com', 'Ava', 'Mitchell', '1991-09-30', 'male', '90 Example Street', 'London', 'village', 'B1 7GG', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000019', '+44', 'logan.morgan@example.com', 'Logan', 'Morgan', '1993-09-09', 'male', '64 Example Street', 'Nottingham', 'city', 'BS1 4DD', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000020', '+44', 'lily.lee@example.com', 'Lily', 'Lee', '1990-02-09', 'male', '80 Example Street', 'Liverpool', 'shire', 'BS1 4DD', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000021', '+44', 'lucas.white@example.com', 'Lucas', 'White', '1997-08-23', 'female', '70 Example Street', 'Liverpool', 'shire', 'OX1 0JJ', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000022', '+44', 'mia.harris@example.com', 'Mia', 'Harris', '1992-06-29', 'female', '82 Example Street', 'Nottingham', 'village', 'B1 7GG', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000023', '+44', 'noah.thompson@example.com', 'Noah', 'Thompson', '2009-09-25', 'female', '64 Example Street', 'Birmingham', 'town', 'CB1 9II', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000024', '+44', 'ella.jackson@example.com', 'Ella', 'Jackson', '2010-01-20', 'male', '2 Example Street', 'Sheffield', 'city', 'S1 6FF', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000025', '+44', 'jacob.wood@example.com', 'Jacob', 'Wood', '2000-12-10', 'male', '33 Example Street', 'Oxford', 'town', 'NG1 8HH', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000026', '+44', 'ruby.davies@example.com', 'Ruby', 'Davies', '1995-10-08', 'female', '9 Example Street', 'Manchester', 'village', 'E1 1AA', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000027', '+44', 'charlie.carter@example.com', 'Charlie', 'Carter', '1994-03-19', 'male', '6 Example Street', 'Leeds', 'shire', 'B1 7GG', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000028', '+44', 'isla.bennett@example.com', 'Isla', 'Bennett', '2008-06-30', 'male', '20 Example Street', 'Birmingham', 'city', 'CB1 9II', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000029', '+44', 'william.phillips@example.com', 'William', 'Phillips', '2009-05-17', 'male', '74 Example Street', 'Manchester', 'village', 'OX1 0JJ', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000030', '+44', 'freya.gray@example.com', 'Freya', 'Gray', '2005-12-02', 'female', '97 Example Street', 'Bristol', 'city', 'CB1 9II', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000031', '+44', 'thomas.cook@example.com', 'Thomas', 'Cook', '1998-07-15', 'female', '50 Example Street', 'Oxford', 'village', 'BS1 4DD', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000032', '+44', 'evie.shaw@example.com', 'Evie', 'Shaw', '2003-11-26', 'male', '95 Example Street', 'Liverpool', 'city', 'CB1 9II', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000033', '+44', 'george.murray@example.com', 'George', 'Murray', '1994-11-15', 'female', '9 Example Street', 'Birmingham', 'city', 'LS1 5EE', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000034', '+44', 'poppy.palmer@example.com', 'Poppy', 'Palmer', '1997-10-13', 'female', '8 Example Street', 'Liverpool', 'town', 'BS1 4DD', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000035', '+44', 'oscar.mills@example.com', 'Oscar', 'Mills', '2005-07-11', 'female', '8 Example Street', 'London', 'borough', 'NG1 8HH', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000036', '+44', 'jessica.knight@example.com', 'Jessica', 'Knight', '2000-03-13', 'male', '87 Example Street', 'Liverpool', 'city', 'NG1 8HH', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000037', '+44', 'harry.fisher@example.com', 'Harry', 'Fisher', '2002-11-20', 'female', '50 Example Street', 'Birmingham', 'shire', 'M1 2BB', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000038', '+44', 'daisy.stevens@example.com', 'Daisy', 'Stevens', '2006-08-14', 'male', '3 Example Street', 'London', 'village', 'OX1 0JJ', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000039', '+44', 'leo.reed@example.com', 'Leo', 'Reed', '2003-04-18', 'female', '14 Example Street', 'Cambridge', 'city', 'BS1 4DD', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000040', '+44', 'erin.ellis@example.com', 'Erin', 'Ellis', '2006-09-26', 'female', '15 Example Street', 'London', 'village', 'B1 7GG', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000041', '+44', 'muhammad.barnes@example.com', 'Muhammad', 'Barnes', '2003-05-07', 'female', '84 Example Street', 'Manchester', 'village', 'LS1 5EE', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000042', '+44', 'holly.webb@example.com', 'Holly', 'Webb', '2010-08-30', 'female', '38 Example Street', 'Manchester', 'village', 'BS1 4DD', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000043', '+44', 'max.spencer@example.com', 'Max', 'Spencer', '2006-09-16', 'female', '57 Example Street', 'Sheffield', 'town', 'B1 7GG', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000044', '+44', 'lucy.atkinson@example.com', 'Lucy', 'Atkinson', '2006-11-16', 'male', '6 Example Street', 'London', 'borough', 'LS1 5EE', 'UK', TRUE, 'user', TRUE, NULL, NULL),
('7000000045', '+44', 'archie.walsh@example.com', 'Archie', 'Walsh', '2010-05-10', 'male', '30 Example Street', 'Manchester', 'village', 'CB1 9II', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000046', '+44', 'florence.pearson@example.com', 'Florence', 'Pearson', '2000-07-16', 'female', '15 Example Street', 'Liverpool', 'borough', 'OX1 0JJ', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000047', '+44', 'henry.burton@example.com', 'Henry', 'Burton', '2009-11-12', 'male', '14 Example Street', 'Nottingham', 'shire', 'M1 2BB', 'UK', TRUE, 'admin', TRUE, NULL, NULL),
('7000000048', '+44', 'sienna.khan@example.com', 'Sienna', 'Khan', '2006-07-10', 'male', '94 Example Street', 'London', 'borough', 'NG1 8HH', 'UK', TRUE, 'moderator', TRUE, NULL, NULL),
('7000000049', '+44', 'dylan.moore@example.com', 'Dylan', 'Moore', '1998-07-09', 'male', '64 Example Street', 'Sheffield', 'city', 'M1 2BB', 'UK', TRUE, 'admin', TRUE, NULL, NULL);

-- ===========================================
-- OTP LOGINS TABLE
-- ===========================================
CREATE TABLE otp_logins (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    otp_code VARCHAR(255) NOT NULL COMMENT 'Hashed OTP',
    attempts INT DEFAULT 0 COMMENT 'Number of attempts made with this OTP',
    max_attempts INT DEFAULT 5 COMMENT 'Max allowed attempts before locking',
    expires_at TIMESTAMP NOT NULL COMMENT 'Expiration timestamp of the OTP',
    is_used BOOLEAN DEFAULT FALSE COMMENT 'Whether the OTP has been used',
    ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP address from where the OTP was requested',
    user_agent TEXT COMMENT 'User device info (browser, mobile, etc.)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Timestamp when OTP was used',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at)
);

-- ===========================================
-- DOCUMENTS TABLE
-- ===========================================
CREATE TABLE documents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED DEFAULT NULL COMMENT 'If null, document is global to all users',
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50) DEFAULT NULL COMMENT 'e.g., pdf, docx, jpg',
    category ENUM('All','Earthquake', 'Flood', 'Storm', 'Tsunami', 'Fire') DEFAULT 'All',
    is_active BOOLEAN DEFAULT TRUE,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Soft delete',
    uploaded_by BIGINT UNSIGNED DEFAULT NULL COMMENT 'Admin/moderator who uploaded the file',

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,

    INDEX idx_user_file (user_id, file_type),
    INDEX idx_category (category)
);

INSERT INTO documents (
    user_id,
    title,
    description,
    file_url,
    file_type,
    category,
    uploaded_by
) VALUES (
    NULL,
    'Final Project Templates',
    'Standard templates for final project submissions.',
    '/documents/FinalProjectTemplates.pdf',
    'application/pdf',
    'All',
    1 -- replace with actual admin user ID if needed
),
(
    NULL,
    'Earthquake',
    'Earthquake Safety Checklist',
    '/documents/Earthquake.pdf',
    'application/pdf',
    'Earthquake',
    1 -- replace with actual admin user ID if needed
),
(
    NULL,
    'Earthquake Safety Actions',
    'Recommended Earthquake Safety Actions.',
    '/documents/Earthquake_Safety_Actions.pdf',
    'application/pdf',
    'Earthquake',
    1 -- replace with actual admin user ID if needed
),
(
    NULL,
    'Flood',
    'Flood Safety Checklist',
    '/documents/Flood.pdf',
    'application/pdf',
    'Flood',
    1 -- replace with actual admin user ID if needed
),
(
    NULL,
    'Flood Safety',
    'Flood Safety',
    '/documents/Flood_Safety.pdf',
    'application/pdf',
    'Flood',
    1 -- replace with actual admin user ID if needed
),
(
    NULL,
    'Storm Safety',
    'Storm Safety Tips',
    '/documents/storm_safety_tips.pdf',
    'application/pdf',
    'Storm',
    1 -- replace with actual admin user ID if needed
),
(
    NULL,
    'Tsunami',
    'Tsunami Safety Tips',
    '/documents/Tsunami.pdf',
    'application/pdf',
    'Tsunami',
    1 -- replace with actual admin user ID if needed
);

-- ===========================================
-- DOCUMENT_READS TABLE
-- Tracks whether a user has read a specific document
-- ===========================================
CREATE TABLE document_reads (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    document_id BIGINT UNSIGNED NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uniq_user_document (user_id, document_id),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,

    INDEX idx_user (user_id),
    INDEX idx_document (document_id)
);

-- ===========================================
-- EMERGENCY CONTACTS TABLE
-- ===========================================
CREATE TABLE emergency_contacts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_contact_per_user (user_id, phone_number)
);

-- ===========================================
-- NEWS BOOKMARKS TABLE
-- ===========================================
CREATE TABLE news_bookmarks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    author VARCHAR(255),
    source_id VARCHAR(255),
    source_name VARCHAR(255),
    urlToImage TEXT,
    content LONGTEXT,
    publishedAt DATETIME,
    category VARCHAR(100) DEFAULT 'General',
    bookmarkedAt DATETIME,
    UNIQUE KEY unique_user_article (user_id, url(255)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===========================================
-- CHATS TABLE
-- ===========================================
CREATE TABLE chats (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    is_group BOOLEAN DEFAULT FALSE,
    name VARCHAR(255) DEFAULT NULL COMMENT 'Group name if group chat',
    latitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Alert latitude',
    longitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Alert longitude',
    radius_km DECIMAL(5,2) DEFAULT NULL COMMENT 'Radius of the alert area',
    created_by BIGINT UNSIGNED COMMENT 'User who created the chat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ===========================================
-- CHAT MEMBERS TABLE (Enhanced with role)
-- ===========================================
CREATE TABLE chat_members (
    chat_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    role ENUM('member', 'admin', 'owner') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===========================================
-- CHAT MESSAGES TABLE
-- ===========================================
CREATE TABLE chat_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chat_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED DEFAULT NULL,
    message TEXT NOT NULL,
    message_type ENUM('text', 'image', 'file', 'location', 'poll', 'quiz', 'task', 'info', 'event') DEFAULT 'text',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP NULL DEFAULT NULL COMMENT 'If message was edited',
    deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT 'If message was deleted',
    edited_by BIGINT UNSIGNED DEFAULT NULL COMMENT 'User who edited the message',
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_chat_id (chat_id),
    INDEX idx_sender_id (sender_id)
);

-- ===========================================
-- CHAT ATTACHMENTS TABLE
-- ===========================================
CREATE TABLE chat_attachments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT UNSIGNED NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    thumbnail_url TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

-- ===========================================
-- CHAT READ RECEIPTS TABLE
-- ===========================================
CREATE TABLE chat_read_receipts (
    chat_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

-- ===========================================
-- GROUP METADATA TABLE
-- ===========================================
CREATE TABLE group_metadata (
    chat_id BIGINT UNSIGNED PRIMARY KEY,
    icon_url TEXT,
    description TEXT,
    rules TEXT,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- FULL UPDATED SQL SCHEMA WITH ASSIGNMENTS FOR QUIZZES AND TASKS

-- ===========================================
-- QUIZZES
-- ===========================================
CREATE TABLE quizzes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    xp_reward INT DEFAULT 50,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ===========================================
-- QUIZ QUESTIONS
-- ===========================================
CREATE TABLE quiz_questions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    quiz_id BIGINT UNSIGNED NOT NULL,
    question TEXT NOT NULL,
    question_type ENUM('multiple_choice', 'true_false', 'short_answer') DEFAULT 'multiple_choice',
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- ===========================================
-- QUIZ OPTIONS (For MCQ only)
-- ===========================================
CREATE TABLE quiz_options (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id BIGINT UNSIGNED NOT NULL,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);

-- ===========================================
-- USER QUIZ SUBMISSIONS
-- ===========================================
CREATE TABLE quiz_submissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    quiz_id BIGINT UNSIGNED NOT NULL,
    score INT DEFAULT 0,
    total_questions INT DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- ===========================================
-- CHECKLIST TASKS
-- ===========================================
CREATE TABLE checklist_tasks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE DEFAULT NULL,
    xp_reward INT DEFAULT 25,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- USER CHECKLIST PROGRESS
-- ===========================================
CREATE TABLE user_tasks (
    user_id BIGINT UNSIGNED NOT NULL,
    task_id BIGINT UNSIGNED NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, task_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES checklist_tasks(id) ON DELETE CASCADE
);

-- ===========================================
-- BADGES
-- ===========================================
CREATE TABLE badges (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon_url TEXT,
    `condition` TEXT COMMENT 'Optional description of how to earn it'
);

-- ===========================================
-- USER BADGE ACHIEVEMENTS
-- ===========================================
CREATE TABLE user_badges (
    user_id BIGINT UNSIGNED NOT NULL,
    badge_id BIGINT UNSIGNED NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, badge_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
);

-- ===========================================
-- USER XP & LEVELS (Gamification)
-- ===========================================
CREATE TABLE user_levels (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    xp INT DEFAULT 0,
    level INT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===========================================
-- USER ASSIGNED QUIZZES
-- ===========================================
CREATE TABLE user_assigned_quizzes (
    user_id BIGINT UNSIGNED NOT NULL,
    quiz_id BIGINT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, quiz_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- ===========================================
-- USER ASSIGNED TASKS
-- ===========================================
CREATE TABLE user_assigned_tasks (
    user_id BIGINT UNSIGNED NOT NULL,
    task_id BIGINT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, task_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES checklist_tasks(id) ON DELETE CASCADE
);

-- Step 2: system_alerts
CREATE TABLE system_alerts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL COMMENT 'Alert headline',
    message TEXT COMMENT 'Detailed description of the alert',
    category ENUM('maintenance', 'update', 'security', 'general', 'emergency', 'weather') DEFAULT 'general',
    urgency ENUM('severe', 'moderate', 'advisory') DEFAULT 'advisory' COMMENT 'Severity level of the alert',
    latitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Latitude of alert center',
    longitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Longitude of alert center',
    radius_km DECIMAL(5,2) DEFAULT NULL COMMENT 'Effective radius of alert area',
    is_active BOOLEAN DEFAULT TRUE,
    created_by BIGINT UNSIGNED COMMENT 'User ID of the admin who created the alert',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE system_alert_reads (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    system_alert_id BIGINT UNSIGNED NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_alert (user_id, system_alert_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (system_alert_id) REFERENCES system_alerts(id) ON DELETE CASCADE
);

CREATE TABLE user_alerts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    type ENUM('chat', 'task', 'quiz', 'system', 'emergency', 'weather') NOT NULL,
    related_id BIGINT UNSIGNED COMMENT 'Can reference multiple types (system, chat, quiz, etc.)',
    title VARCHAR(255),
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    urgency ENUM('severe', 'moderate', 'advisory') DEFAULT NULL COMMENT 'Urgency level for emergency alerts',
    latitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Alert latitude',
    longitude DECIMAL(10,7) DEFAULT NULL COMMENT 'Alert longitude',
    radius_km DECIMAL(5,2) DEFAULT NULL COMMENT 'Radius of the alert area',
    source VARCHAR(255) DEFAULT NULL COMMENT 'Generated by system, admin, etc.',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO users
(id, phone_number, country_code, email, first_name, last_name, date_of_birth, gender, address_line1, address_line2, city, state, postal_code, country, profile_picture_url, is_phone_verified, role, is_active, latitude, longitude, created_by, updated_by, created_at, updated_at, deleted_at)
VALUES
(51, '1234567890', '+44', 'sam.law@gmail.com', 'Sam', 'Law', NULL, 'other', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 'user', 1, 37.4219983, -122.0840000, NULL, NULL, '2025-05-31 19:17:22', '2025-05-31 19:43:30', NULL);

INSERT INTO system_alerts
(title, message, category, urgency, latitude, longitude, radius_km, is_active, created_by)
VALUES
('System Maintenance', 'Scheduled maintenance at midnight. Expect downtime of up to 2 hours.', 'maintenance', 'advisory', NULL, NULL, NULL, TRUE, NULL),
('Critical Security Patch', 'A critical security vulnerability has been patched. Please update your software.', 'security', 'severe', NULL, NULL, NULL, TRUE, NULL),
('Emergency Tsunami Alert', 'sunami warning issued! Seek higher ground immediately.', 'emergency', 'severe', 37.4219983, -122.0840000, 100.00, TRUE, NULL),
('Emergency Earthquake Alert', 'Earthquake detected nearby! Follow safety protocols immediately.', 'emergency', 'severe', 51.5074, -0.1278, 10.00, TRUE, NULL),
('General System Update', 'System has been updated to version 2.1. Please check the release notes.', 'update', 'moderate', NULL, NULL, NULL, TRUE, NULL),
('Flood Warning in Low-Lying Areas- K',  'Heavy rainfall is causing river levels to rise rapidly. Move to higher ground if necessary.','emergency','severe', NULL, NULL,NULL, TRUE, NULL),
('Urban Flood Advisory',  'Water accumulation reported in urban areas. Drive cautiously and avoid waterlogged streets.', 'weather', 'advisory', NULL, NULL, NULL, TRUE, NULL),
('Tsunami Watch Lifted',  'No significant wave activity detected. Previous tsunami watch has been canceled.', 'emergency','advisory', NULL, NULL, NULL, TRUE, NULL),
('Moderate Earthquake Recorded',  'A magnitude 5.0 earthquake was recorded. Be cautious of aftershocks and inspect for damage.', 'emergency', 'moderate', NULL, NULL, NULL, TRUE, NULL),
('Aftershock Advisory','Minor aftershocks expected following earlier quake. Avoid unstable structures and debris zones.','emergency','advisory', NULL, NULL, NULL, TRUE, NULL),
('Severe Thunderstorm Incoming','Intense thunderstorm approaching with possible hail and power outages. Stay indoors.','emergency','severe', NULL, NULL, NULL, TRUE, NULL),
('Storm System Weakening', 'The storm is losing strength but light rain and wind may persist into the evening.','emergency','moderate', NULL, NULL, NULL, TRUE, NULL),
('Forest Fire in Nearby Region', 'Wildfire activity reported nearby. Smoke may affect air quality. Be prepared for evacuation alerts.', 'emergency','severe', NULL, NULL, NULL, TRUE, NULL),
('Controlled Burn Underway','Authorities are conducting a controlled burn. Do not report unless you see uncontrolled fire.','emergency','advisory', NULL, NULL, NULL, TRUE, NULL);


INSERT INTO user_alerts
(user_id, type, related_id, title, message, is_read, urgency, latitude, longitude, radius_km, source)
VALUES
(51, 'system', 1, 'Scheduled Maintenance Notice', 'Scheduled maintenance at midnight. Expect downtime of up to 2 hours.', FALSE, 'advisory', NULL, NULL, NULL, 'system'),
(51, 'system', 2, 'Security Update Required', 'A critical security vulnerability has been patched. Please update your software.', FALSE, 'severe', NULL, NULL, NULL, 'system'),
(51, 'emergency', 3, 'Earthquake Alert', 'Earthquake detected nearby! Follow safety protocols immediately.', FALSE, 'severe', 37.4219983, -122.0840000, 10.00, 'system'),
(51, 'system', 4, 'System Update', 'System has been updated to version 2.1. Please check the release notes.', TRUE, 'moderate', NULL, NULL, NULL, 'system');

CREATE TABLE IF NOT EXISTS emergency_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    alert_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivery_status ENUM('sent', 'failed') DEFAULT 'sent',
    FOREIGN KEY (alert_id) REFERENCES system_alerts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===========================================
-- ADMIN ACTION LOGS TABLE
-- ===========================================
CREATE TABLE admin_action_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_user_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(255) NOT NULL,
    target_user_id BIGINT UNSIGNED DEFAULT NULL,
    entity_type VARCHAR(100) DEFAULT NULL COMMENT 'e.g., user, chat, bookmark',
    entity_id BIGINT UNSIGNED DEFAULT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
);
