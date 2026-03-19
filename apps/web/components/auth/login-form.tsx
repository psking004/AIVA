/**
 * Login Form Component
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Mail, Lock } from 'lucide-react';
import { Button } from '@aiva/ui';
import { Input } from '@aiva/ui';
import { aivaClient } from '@aiva/api-client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await aivaClient.login({ email, password });
      router.push('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <Sparkles className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold">Welcome to AIVA</h1>
        <p className="text-gray-500 mt-2">Sign in to your personal AI operating system</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-5 h-5" />}
          required
        />

        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="w-5 h-5" />}
          required
        />

        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
        >
          Sign In
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-500">
          Don't have an account?{' '}
          <a href="/register" className="text-blue-500 hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
