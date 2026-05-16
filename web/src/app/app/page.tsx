"use client";

import { Dashboard } from "@/components/DashboardUI";
import { Nav, Footer } from "@/components/SharedUI";

export default function AppPage() {
  return (
    <div className="page">
      <Nav view="dashboard" />
      <main style={{ flex: 1 }}>
        <Dashboard />
      </main>
      <Footer />
    </div>
  );
}
