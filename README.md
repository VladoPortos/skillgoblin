# SkillGoblin

A streamlined, self-hosted learning platform focused on simplicity and ease of maintenance.

## Project Vision

SkillGoblin is a lightweight, self-contained learning platform designed for local hosting. It focuses on video content delivery with minimal overhead, allowing for easy setup and maintenance without complex dependencies.

### Core Philosophy
- **Streamlined Experience**: Focus on content consumption, not marketing or social features
- **Local-First**: Designed to run on local networks without external dependencies
- **Lightweight**: Minimal resource usage and simple architecture
- **Easily Maintainable**: Modular design with minimal recompilation needed

## Features

- **User Management**
  - Simple login with avatar-based selection
  - Progress tracking across courses
  - Favorites and "continue watching" functionality

- **Content Organization**
  - Course categories with color-coding
  - Hierarchical lesson structure
  - Video playback with progress tracking
  - Course descriptions and thumbnails
  - Natural sorting of video files
  - Real-time file monitoring for course updates and deletions

- **Mobile-Friendly Interface**
  - Responsive design works on all devices
  - Simple navigation for touch interfaces
  - Optimized video playback for mobile

## Technical Stack

- **Frontend**: Nuxt.js with Nitro server
- **Database**: SQLite (file-based, no separate service needed)
- **Containerization**: Docker for development and production
- **Video Handling**: Direct file serving via Nitro
- **File Monitoring**: Chokidar for real-time content updates

## Content Management

- **File Structure**:
  ```
  data/
  ├── database/
  │   └── database.sqlite    # SQLite database
  └── content/
      ├── Course Name/
      │   ├── thumbnail.jpg    # Course thumbnail
      │   ├── Lesson 1/        # First lesson folder
      │   │   ├── 1. video1.mp4
      │   │   ├── 2. video2.mp4
      │   │   └── 3. video3.mp4
      │   └── Lesson 2/        # Second lesson folder
      │       ├── 1. video1.mp4
      │       └── 2. video2.mp4
      └── Another Course/
          └── ...
  ```

- **File Monitoring**:
  - Real-time monitoring of the content directory
  - Automatic detection of new courses and course updates
  - Automatic removal of deleted courses from the database
  - Cleanup of user progress for deleted courses

- **Benefits**:
  - Add/modify courses by simply copying folders
  - No database interaction required for content management
  - Easy to backup, version control, or transfer courses
  - Natural organization that matches how video content is typically structured

The application scans the content directory on startup to index available courses.

## Project Structure

```
skillgoblin/
├── docker-compose.yml       # Development Docker configuration
├── docker-compose.prod.yml  # Production Docker configuration
├── Dockerfile.prod          # Production Docker build
├── frontend/                # Nuxt application
│   ├── pages/               # Page components
│   ├── components/          # Reusable UI components
│   ├── server/              # API routes and database access
│   └── public/              # Static assets
└── data/                    # Persistent data
    ├── database/            # Database files
    │   └── database.sqlite  # SQLite database
    └── content/             # Course videos and images
```

## Configuration

The application can be configured using environment variables:

*   **`CONTENT_DIR`**: (Optional) Specifies the directory path within the container where course content folders are located. Defaults to `/app/data/content`.
*   **`DB_PATH`**: (Optional) Specifies the path within the container for the SQLite database file. Defaults to `/app/data/database/skillgoblin.db`.
*   **`CHOKIDAR_POLLING_INTERVAL`**: (Optional) Sets the polling interval in milliseconds for the file watcher that detects new or removed course directories.
    *   Defaults to `60000` (60 seconds).
    *   Set to `0` to disable the file watcher completely. This can be useful on systems like Unraid to prevent the watcher's polling activity from keeping storage drives awake.
    *   When disabled, new or removed courses will only be detected during the initial server startup scan or when a manual rescan is triggered through the application's interface (if available).

## Quick Start Guide

### Running the Application

#### Development Mode

```bash
# Start the application in development mode
docker-compose up

# Start in detached mode (background)
docker-compose up -d

# View logs when running in detached mode
docker-compose logs -f

# Stop the application
docker-compose down
```

#### Production Mode

```bash
# Build and start the application in production mode
docker-compose -f docker-compose.prod.yml up --build

# Start in detached mode (background)
docker-compose -f docker-compose.prod.yml up -d

# View logs when running in detached mode
docker-compose -f docker-compose.prod.yml logs -f

# Stop the application
docker-compose -f docker-compose.prod.yml down
```

### Adding New Courses

1. Create a new folder under `data/content/` with your course name
2. Create subfolders for each lesson and add your video files
3. The application will automatically detect the new course (no restart required) / Optionally you can trigger a rescan from the interface in admin mode

### Removing Courses

1. Simply delete the course folder from `data/content/`
2. The application will automatically detect the deletion and remove the course from the database
3. User progress for the deleted course will be cleaned up automatically

### Development Workflow

1. The Nuxt application runs in development mode, so changes to files are reflected immediately
2. The frontend code is in the `frontend` directory
3. Database files are stored in the `data/database` directory
4. Course content is in `data/content`

### User Data

User data is stored in SQLite at `data/database/database.sqlite`. You can inspect this database using any SQLite browser:

```sql
-- Schema overview
.tables
-- View users
SELECT * FROM users;
-- View progress
SELECT * FROM user_progress;
-- View courses
SELECT * FROM courses;
```

## Production Deployment

For production deployment, use the included Docker Compose production configuration:

```bash
# Build the production container
docker-compose -f docker-compose.prod.yml build

# Run the production container
docker-compose -f docker-compose.prod.yml up -d
```

The production setup includes:

1. Multi-stage build for smaller image size
2. Production-optimized Nuxt configuration
3. Proper volume mounting for persistent data
4. Automatic restart policies
5. Environment variable configuration

## Troubleshooting

### Course Content Not Appearing

1. Check that the course folder exists in `data/content/`
2. Check the application logs for any error messages
3. Ensure video files are in supported formats (MP4 recommended)

### Database Issues

1. If you experience database issues, you can reset the database by deleting `data/database/database.sqlite`
2. The application will recreate the database on next startup
3. Note that this will erase all user data and progress

## Changelog

### 23.05.2025

- Fixed forced rescan upon long inactivity, app now checks if the DB is populated already and not force rescan if not needed, Leaving it to periodic check or manual trigger.
- thumbnail.jpg. If there is no thumbnail.jpg, default thumbnail is used. If there is thumbnail.jpg, it will be used and added to DB. If you add thumbnail.jpg to a course via edit the local thumbnail.jpg will be replaced with the one added.
- Added Button to browse non video files in course folder.
