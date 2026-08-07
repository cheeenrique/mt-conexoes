import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/service';

// Redirecionamento temporário — substituído pela tela real do painel na Task 19.
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? '/conta' : '/login');
}
