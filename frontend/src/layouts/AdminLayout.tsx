import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50 print:block print:bg-white">
      <div className="print:hidden">
        <AdminSidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <AdminTopbar onOpenMobileMenu={() => setMobileOpen(true)} />
        </div>
        {/* Sem padding/fundo no papel: uma tela cheia de cinza e margem faz sentido no
            monitor, nao numa folha impressa ou num PDF gerado pra mandar pra alguem. */}
        <main className="flex-1 px-4 py-6 sm:px-6 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
