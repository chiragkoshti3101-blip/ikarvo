import type { Metadata } from 'next';
import Workspace from '@/components/Workspace';
export const metadata: Metadata = { title: 'Workspace' };
export default function AppPage() { return <Workspace />; }
