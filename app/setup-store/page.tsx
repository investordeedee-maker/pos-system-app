"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function SetupStorePage() {
  const [storeName, setStoreName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (isMounted) setUserId(user.id);
      } else {
        if (isMounted) router.push("/login");
      }
    };
    getUser();
    return () => { isMounted = false; };
  }, [router]);

  const handleSetupStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setLoading(true);

    try {
      // 1. สร้างร้านค้าใหม่ในตาราง stores
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .insert([{ name: storeName, tax_id: taxId }])
        .select()
        .single();

      if (storeError) {
        throw new Error("สร้างร้านค้าไม่สำเร็จ: " + storeError.message);
      }

      // 2. เอาข้อมูลคนสมัครไปผูกเป็น Admin ของร้านนี้ในตาราง profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .insert([{ 
            id: userId, 
            store_id: storeData.id, 
            full_name: fullName, 
            role: "admin" 
        }]);

      if (profileError) {
        throw new Error("ผูกบัญชีไม่สำเร็จ: " + profileError.message);
      }

      alert("สร้างร้านค้าสำเร็จ! กำลังพาท่านเข้าสู่ระบบ POS...");
      router.push("/pos"); 

    } catch (error: unknown) {
      // ปรับปรุงการจับ Error ให้ดึงข้อความจริงจาก Supabase มาโชว์เสมอ
      const err = error as { message?: string };
      alert("แจ้งเตือนจากระบบ: " + (err.message || "ไม่สามารถระบุสาเหตุได้ กรุณาลองใหม่"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border-t-4 border-blue-600">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ตั้งค่าร้านค้าของคุณ</h1>
          <p className="text-gray-500 mt-2 text-sm">
            กรอกข้อมูลเพื่อเริ่มต้นระบบบริหารจัดการ
          </p>
        </div>

        <form onSubmit={handleSetupStore} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อร้าน / ชื่อบริษัท <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="เช่น บริษัท นำพาสุข จำกัด"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลขประจำตัวผู้เสียภาษี (ถ้ามี)</label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="13 หลัก"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้งาน (ของคุณ) <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="ชื่อ-นามสกุล หรือ ชื่อเล่น"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !userId}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-6 disabled:bg-gray-400"
          >
            {loading ? "กำลังสร้างระบบ..." : "ยืนยันการสร้างร้านค้า"}
          </button>
        </form>
      </div>
    </div>
  );
}