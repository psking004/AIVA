# AIVA Security Guidelines

## Security Audit Findings & Remediation

### Critical Fixes Required Before Production

#### 1. Fix Authentication Bypass

All controllers must properly validate JWT tokens:

```typescript
// backend/src/modules/tasks/tasks.controller.ts (example fix)
import { JwtService } from '@nestjs/jwt';

@Controller('tasks')
export class TasksController {
  constructor(
    private tasksService: TasksService,
    private jwtService: JwtService,
  ) {}

  private extractUserId(auth: string): string {
    const token = auth?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Missing token');

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

#### 2. Secure JWT Configuration

```typescript
// backend/src/modules/auth/strategies/jwt.strategy.ts
constructor(private configService: ConfigService) {
  const secret = configService.get('JWT_SECRET');
  if (!secret || secret === 'aiva-secret-key') {
    throw new Error('JWT_SECRET must be set to a secure random value');
  }

  super({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: secret,
    ignoreExpiration: false,
  });
}
```

#### 3. File Upload Validation

```typescript
// backend/src/modules/files/files.service.ts
import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

const ALLOWED_MIME_TYPES = ['application/pdf', 'text/plain', 'application/json'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function validateFile(file: FileUploadDto) {
  // Check file size
  if (file.fileSize > MAX_FILE_SIZE) {
    throw new BadRequestException('File too large');
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
    throw new BadRequestException('File type not allowed');
  }

  // Check for path traversal
  if (file.fileName.includes('..') || file.storagePath.includes('..')) {
    throw new BadRequestException('Invalid file path');
  }

  // Validate file extension
  const allowedExtensions = ['.pdf', '.txt', '.json', '.md', '.doc', '.docx'];
  const ext = extname(file.fileName).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new BadRequestException('File extension not allowed');
  }
}
```

#### 4. Password Validation

```typescript
// backend/src/modules/auth/auth.service.ts
import { BadRequestException } from '@nestjs/common';

async function validatePassword(password: string) {
  if (password.length < 12) {
    throw new BadRequestException('Password must be at least 12 characters');
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestException('Password must contain uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestException('Password must contain lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException('Password must contain number');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    throw new BadRequestException('Password must contain special character');
  }
}
```

#### 5. Rate Limiting on Auth Routes

```typescript
// backend/src/modules/auth/auth.controller.ts
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  @Post('login')
  @Throttle(5, 60) // 5 requests per minute
  async login(@Body() body: LoginDto) {
    // ...
  }
}
```

#### 6. Email Verification Flow

```typescript
// Add to User model
emailVerified: DateTime?
emailVerificationToken: String?
emailVerificationTokenExpiry: DateTime?

// In AuthService
async sendVerificationEmail(user: User) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await this.prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: bcrypt.hashSync(token, 10),
      emailVerificationTokenExpiry: expiry,
    },
  });

  // Send email with verification link
}
```

#### 7. Security Headers

```typescript
// backend/src/server.ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [`'self'`],
      styleSrc: [`'self'`, `'unsafe-inline'`],
      imgSrc: [`'self'`, 'data:', 'https:'],
      scriptSrc: [`'self'`],
      connectSrc: [`'self'`, 'https://api.anthropic.com'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-site' },
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
  },
}));
```

#### 8. AI Input Sanitization

```typescript
// backend/src/ai/aiva.service.ts
function sanitizeInput(input: string): string {
  // Remove potential prompt injection patterns
  const patterns = [
    /ignore all previous instructions/gi,
    /you are now/gi,
    /system prompt/gi,
    /developer mode/gi,
    /###/g,
  ];

  let sanitized = input;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.trim();
}
```

---

## Security Checklist for Production

- [ ] All JWT_SECRET values are cryptographically random (min 32 bytes)
- [ ] Database passwords are not default values
- [ ] Authentication properly validates tokens on all protected routes
- [ ] File uploads validate type, size, and path
- [ ] Rate limiting enabled on auth and API endpoints
- [ ] Password requirements enforced (12+ chars, complexity)
- [ ] Email verification required for new accounts
- [ ] HTTPS enforced with HSTS header
- [ ] CORS properly configured for production domains
- [ ] Security headers configured
- [ ] Audit logging enabled for security events
- [ ] Session invalidation on password change
- [ ] API keys scoped and rotated regularly
- [ ] Vector database configured for persistence
- [ ] Prompt injection protection implemented
- [ ] Dependency vulnerabilities scanned regularly

---

## Environment Security

### Required Environment Variables

```bash
# Must be set before starting production
export JWT_SECRET=$(openssl rand -base64 32)
export DATABASE_PASSWORD=$(openssl rand -base64 32)
export ANTHROPIC_API_KEY=your-key
export REDIS_PASSWORD=$(openssl rand -base64 32)
```

### Prohibited Patterns

- Never commit `.env` files
- Never use default passwords in production
- Never log sensitive data (passwords, tokens, API keys)
- Never expose internal service ports publicly

---

## Monitoring & Incident Response

### Security Events to Log

1. Failed login attempts (with IP, user agent)
2. Successful logins from new devices/locations
3. Password change events
4. Permission/role changes
5. Bulk data exports
6. API key creation/rotation
7. Rate limit violations

### Alert Thresholds

- 5+ failed logins from same IP in 10 minutes
- Unusual data access patterns
- New admin account creation
- Bulk record deletion
