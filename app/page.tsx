"use client";
import Link from "next/link";

export default function MainDashboard() {
  const menus = [
    { href: "/pos", icon: "🛒", title: "หน้าจอขาย (POS)", desc: "แคตตาล็อกสินค้า คิดเงิน และออกบิล", color: "text-blue-600", bg: "bg-blue-50", border: "hover:border-blue-500" },
    { href: "/products", icon: "📦", title: "จัดการสินค้า", desc: "เพิ่ม/ลด/แก้ไข สต๊อกและราคา", color: "text-emerald-600", bg: "bg-emerald-50", border: "hover:border-emerald-500" },
    { href: "/orders", icon: "🧾", title: "ประวัติยอดขาย", desc: "ดูรายงาน ตรวจสอบบิลย้อนหลัง", color: "text-purple-600", bg: "bg-purple-50", border: "hover:border-purple-500" },
    { href: "/setup-store", icon: "🏪", title: "ตั้งค่าร้านค้า", desc: "จัดการชื่อ โลโก้ และข้อมูลภาษี", color: "text-orange-600", bg: "bg-orange-50", border: "hover:border-orange-500" },
    { href: "/settings", icon: "⚙️", title: "ตั้งค่าระบบ", desc: "การตั้งค่าขั้นสูงสำหรับผู้ดูแล", color: "text-gray-600", bg: "bg-gray-100", border: "hover:border-gray-500" },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-gray-800 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        
        {/* หัวเว็บ */}
        <header className="mb-10 border-b border-gray-200 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Standard POS</h1>
            <p className="text-slate-500 mt-2 text-lg">ระบบบริหารจัดการร้านค้าแบบครบวงจร</p>
          </div>
          <div className="hidden md:block">
            <span className="bg-slate-200 text-slate-700 px-3 py-1 text-sm font-bold rounded-full">Admin Panel</span>
          </div>
        </header>

        {/* เมนูการทำงาน */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menus.map((menu, index) => (
            <Link key={index} href={menu.href} className={`group bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 flex flex-col gap-4 ${menu.border}`}>
              <div className={`w-14 h-14 ${menu.bg} ${menu.color} rounded-xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform`}>
                {menu.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1 group-hover:text-black transition-colors">{menu.title}</h2>
                <p className="text-sm text-slate-500 leading-relaxed">{menu.desc}</p>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}