import DoctorSidebar from '@/components/doctor/DoctorSidebar';

export default function DoctorDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-65px)]">
      <DoctorSidebar />
      <main className="flex-1 bg-gray-50 overflow-y-auto">{children}</main>
    </div>
  );
}
