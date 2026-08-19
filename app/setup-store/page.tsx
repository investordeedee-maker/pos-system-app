"use client";
import { useRouter } from "next/navigation";

export default function SetupStorePage() {
  const router = useRouter();
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 flex-col relative">
      <div className="w-full absolute top-0 left-0 bg-blue-600 p-4 shadow-md flex justify-start">
        <button onClick={() => router.push("/")} className="cursor-pointer bg-white text-blue-700 px-5 py-2 rounded-xl font-bold hover:bg-gray-100 transition-all flex items-center gap-2">
          ← กลับหน้าเมนูหลัก
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md relative mt-16 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-gray-800">⚙️ ตั้งค่าร้านค้าของคุณ</h1>
          <p className="text-gray-500 text-sm mt-2">กรอกข้อมูลเพื่อเริ่มต้นระบบบริหารจัดการ</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อร้าน / ชื่อบริษัท <span className="text-red-500">*</span></label>
            <input type="text" placeholder="เช่น บริษัท นำพาความสุข จำกัด" className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-gray-50 hover:bg-white" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">เลขประจำตัวผู้เสียภาษี (ถ้ามี)</label>
            <input type="text" placeholder="13 หลัก" className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-gray-50 hover:bg-white" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อผู้ใช้งาน (ของคุณ) <span className="text-red-500">*</span></label>
            <input type="text" placeholder="ชื่อ-นามสกุล หรือ ชื่อเล่น" className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-gray-50 hover:bg-white" />
          </div>

          <button className="cursor-pointer w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg mt-4 active:scale-95 transition-transform text-lg">
            💾 บันทึกข้อมูลร้านค้า
          </button>
        </div>
      </div>
    </div>
  );
}