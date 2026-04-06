import PatientSidebar from '@/components/patient/PatientSidebar';

export default function PatientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-65px)]">
      <PatientSidebar />
      <main className="flex-1 bg-gray-50 overflow-y-auto">{children}</main>
    </div>
  );
}
