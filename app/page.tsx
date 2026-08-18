"use client";
import Link from "next/link";

export default function MainDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-800 tracking-tight mb-2">ระบบจัดการร้านค้า</h1>
        <p className="text-gray-500">กรุณาเลือกเมนูที่คุณต้องการเข้าใช้งาน</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl w-full">
        {/* ปุ่มไปหน้า POS */}
        <Link href="/pos" className="bg-blue-600 text-white p-8 rounded-3xl shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-4 hover:shadow-blue-200">
          <span className="text-5xl">🛒</span>
          <span className="font-bold text-2xl">หน้าจอขาย (POS)</span>
        </Link>

        {/* ปุ่มไปหน้าจัดการสินค้า */}
        <Link href="/products" className="bg-green-600 text-white p-8 rounded-3xl shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-4 hover:shadow-green-200">
          <span className="text-5xl">📦</span>
          <span className="font-bold text-2xl">จัดการสินค้า</span>
        </Link>

        {/* ปุ่มไปหน้าบิล/ออเดอร์ */}
        <Link href="/orders" className="bg-purple-600 text-white p-8 rounded-3xl shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-4 hover:shadow-purple-200">
          <span className="text-5xl">🧾</span>
          <span className="font-bold text-2xl">ประวัติยอดขาย</span>
        </Link>

        {/* ปุ่มไปหน้าตั้งค่าร้านค้า */}
        <Link href="/setup-store" className="bg-orange-600 text-white p-8 rounded-3xl shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-4 hover:shadow-orange-200">
          <span className="text-5xl">🏪</span>
          <span className="font-bold text-2xl">ตั้งค่าร้านค้า</span>
        </Link>

        {/* ปุ่มไปหน้าตั้งค่าบัญชี/อื่นๆ */}
        <Link href="/settings" className="bg-gray-700 text-white p-8 rounded-3xl shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-4 hover:shadow-gray-300">
          <span className="text-5xl">⚙️</span>
          <span className="font-bold text-2xl">ตั้งค่าระบบ</span>
        </Link>
      </div>
    </div>
  );
}