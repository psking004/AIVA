/**
 * Database Seed Script
 *
 * Populates the database with sample data for development
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create test user
  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      timezone: 'America/New_York',
      language: 'en',
    },
  });

  console.log(`Created user: ${user.email}`);

  // Create sample tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        userId: user.id,
        title: 'Review Q1 report',
        description: 'Review the quarterly financial report and prepare summary',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        tags: ['work', 'finance'],
      },
    }),
    prisma.task.create({
      data: {
        userId: user.id,
        title: 'Update project documentation',
        description: 'Update API docs with new endpoints',
        priority: 'MEDIUM',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        tags: ['documentation'],
      },
    }),
    prisma.task.create({
      data: {
        userId: user.id,
        title: 'Team standup meeting',
        description: 'Daily sync with the engineering team',
        priority: 'MEDIUM',
        dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000),
        tags: ['meeting'],
        completedAt: new Date(),
        status: 'COMPLETED',
      },
    }),
    prisma.task.create({
      data: {
        userId: user.id,
        title: 'Code review for PR #42',
        description: 'Review the authentication refactoring PR',
        priority: 'CRITICAL',
        dueDate: new Date(Date.now() + 6 * 60 * 60 * 1000),
        tags: ['engineering', 'review'],
      },
    }),
  ]);

  console.log(`Created ${tasks.length} tasks`);

  // Create sample notes
  const notes = await Promise.all([
    prisma.note.create({
      data: {
        userId: user.id,
        title: 'Meeting notes - Q1 Planning',
        content: `# Q1 Planning Meeting

## Attendees
- John (PM)
- Sarah (Design)
- Mike (Engineering)

## Key Decisions
1. Launch date set for March 15
2. Budget approved for Q2
3. Need to hire 2 more engineers

## Action Items
- John: Finalize roadmap
- Sarah: Complete designs by EOW
- Mike: Sprint planning`,
        tags: ['meeting', 'planning'],
        isPinned: true,
      },
    }),
    prisma.note.create({
      data: {
        userId: user.id,
        title: 'Project Ideas',
        content: `# Future Project Ideas

## AI Features
- Smart task prioritization
- Email summarization
- Meeting transcription

## Integrations
- Slack notifications
- Google Calendar sync
- Notion export

## Performance
- Cache optimization
- Query optimization
- CDN for assets`,
        tags: ['ideas', 'planning'],
      },
    }),
  ]);

  console.log(`Created ${notes.length} notes`);

  // Create sample calendar events
  const events = await Promise.all([
    prisma.calendarEvent.create({
      data: {
        userId: user.id,
        title: 'Team Standup',
        description: 'Daily engineering sync',
        startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 2.5 * 60 * 60 * 1000),
        attendees: ['john@example.com', 'sarah@example.com'],
        recurrence: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
      },
    }),
    prisma.calendarEvent.create({
      data: {
        userId: user.id,
        title: 'Q1 Business Review',
        description: 'Quarterly review with stakeholders',
        location: 'Conference Room A',
        startTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        attendees: ['exec-team@example.com'],
        meetingLink: 'https://meet.example.com/q1-review',
      },
    }),
  ]);

  console.log(`Created ${events.length} calendar events`);

  // Create sample conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: 'Task Management Chat',
      messages: {
        create: [
          {
            role: 'USER',
            content: 'Create a task to review the Q1 report',
          },
          {
            role: 'ASSISTANT',
            content: "I've created a task: 'Review Q1 report' with HIGH priority due tomorrow. Is there anything else you'd like me to help with?",
          },
        ],
      },
    },
  });

  console.log(`Created conversation: ${conversation.id}`);

  // Create sample automation rule
  const rule = await prisma.automationRule.create({
    data: {
      userId: user.id,
      name: 'Daily Task Summary',
      description: 'Send daily summary of pending tasks',
      trigger: { type: 'schedule', config: { cron: '0 9 * * *' } },
      actions: [
        { type: 'notification', config: { message: 'Daily task summary' } },
        { type: 'email', config: { template: 'task-summary' } },
      ],
      isActive: true,
    },
  });

  console.log(`Created automation rule: ${rule.name}`);

  // Create activity logs
  await prisma.activityLog.createMany({
    data: [
      { userId: user.id, action: 'task.created', resource: 'task', metadata: { taskId: tasks[0].id } },
      { userId: user.id, action: 'note.created', resource: 'note', metadata: { noteId: notes[0].id } },
      { userId: user.id, action: 'event.created', resource: 'calendar_event', metadata: { eventId: events[0].id } },
      { userId: user.id, action: 'user.login', metadata: { provider: 'email' } },
    ],
  });

  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
