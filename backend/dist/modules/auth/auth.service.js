"use strict";
/**
 * AuthService - Handles authentication logic
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../database/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
let AuthService = AuthService_1 = class AuthService {
    prisma;
    jwtService;
    configService;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(prisma, jwtService, configService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
    }
    /**
     * Register a new user
     */
    async register(email, password, firstName, lastName) {
        // Check if user exists
        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing) {
            throw new common_1.UnauthorizedException('Email already registered');
        }
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        // Create user
        const user = await this.prisma.user.create({
            data: {
                email,
                passwordHash,
                firstName,
                lastName,
            },
        });
        this.logger.log(`User registered: ${email}`);
        const token = await this.generateToken(user.id);
        return {
            user: this.sanitizeUser(user),
            token,
        };
    }
    /**
     * Login user
     */
    async login(email, password) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const token = await this.generateToken(user.id);
        // Create session
        await this.prisma.session.create({
            data: {
                userId: user.id,
                token: this.hashToken(token),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
        this.logger.log(`User logged in: ${email}`);
        return {
            user: this.sanitizeUser(user),
            token,
        };
    }
    /**
     * Logout user
     */
    async logout(userId, token) {
        await this.prisma.session.updateMany({
            where: { userId, token: this.hashToken(token) },
            data: { expiresAt: new Date() },
        });
        this.logger.log(`User logged out: ${userId}`);
    }
    /**
     * Validate JWT token
     */
    async validateToken(token) {
        try {
            const payload = this.jwtService.verify(token);
            return payload;
        }
        catch {
            return null;
        }
    }
    /**
     * Refresh token
     */
    async refreshToken(userId) {
        return this.generateToken(userId);
    }
    /**
     * Generate JWT token
     */
    async generateToken(userId) {
        return this.jwtService.sign({
            sub: userId,
            iat: Math.floor(Date.now() / 1000),
        });
    }
    /**
     * Hash token for storage
     */
    hashToken(token) {
        return bcrypt.hashSync(token, 10);
    }
    /**
     * Remove sensitive data from user object
     */
    sanitizeUser(user) {
        const { passwordHash, ...rest } = user;
        return rest;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map