"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface StoreSettings { id: string; phone_number: string; tax_id: string; promptpay_number: string; invoice_title: string; receipt_title: string; receipt_footer: string; }

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<StoreSettings>({ id: "", phone_number: "", tax_id: "", promptpay_number: "", invoice_title: "ใบแจ้งหนี้", receipt_title: "ใบเสร็จรับเงิน", receipt_footer: "ขอขอบคุณที่มาอุดหนุนและใช้บริการ" });
  const [isSaving, setIsSaving] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
      if (profile?.store_id && isMounted) {
        const { data } = await supabase.from("stores").select("*").eq("id", profile.store_id).single();
        if (data) setSettings(data);
      }
      if (isMounted) setLoading(false);
    };
    fetchSettings();
    return () => { isMounted = false; };
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await supabase.from("stores").update({ phone_number: settings.phone_number, tax_id: settings.tax_id, promptpay_number: settings.promptpay_number, invoice_title: settings.invoice_title, receipt_title: settings.receipt_title, receipt_footer: settings.receipt_footer }).eq("id", settings.id);
      alert("บันทึกการตั้งค่าเรียบร้อยแล้ว");
    } catch { alert("เกิดข้อผิดพลาดในการบันทึก"); } finally { setIsSaving(false); }
  };

  const handleFactoryReset = async () => {
    if (resetConfirmText !== "ยืนยัน") { alert("กรุณาพิมพ์คำว่า 'ยืนยัน' ให้ถูกต้อง"); return; }
    setIsResetting(true);
    try {
      // ล้างข้อมูลบิลและการขาย
      await supabase.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      // ล้างข้อมูลคลังสินค้าและ Stock Card
      await supabase.from("inventory_transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("inventory_lots").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      // รีเซ็ตยอดสต๊อกสินค้าทั้งหมดให้เป็น 0
      await supabase.from("products").update({ stock_qty: 0 }).neq("id", "00000000-0000-0000-0000-000000000000");

      alert("ล้างประวัติการขายและสต๊อกสินค้าเรียบร้อยแล้ว");
      setShowResetModal(false);
      setResetConfirmText("");
    } catch { alert("เกิดข้อผิดพลาดในการล้างข้อมูล"); } finally { setIsResetting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div><h1 className="text-2xl font-black text-gray-800">⚙️ ตั้งค่าระบบ (Settings)</h1></div>
          <button onClick={() => router.push("/")} className="cursor-pointer px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">🏠 กลับหน้าหลัก</button>
        </div>

        <form onSubmit={handleSave} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="block text-sm font-bold text-gray-700 mb-2">เบอร์โทรศัพท์ (แสดงบนใบเสร็จ)</label><input type="text" value={settings.phone_number || ""} onChange={(e) => setSettings({...settings, phone_number: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" /></div>
            <div><label className="block text-sm font-bold text-gray-700 mb-2">เลขประจำตัวผู้เสียภาษี</label><input type="text" value={settings.tax_id || ""} onChange={(e) => setSettings({...settings, tax_id: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" /></div>
          </div>
          <div><label className="block text-sm font-bold text-green-700 mb-2">PromptPay สำหรับรับเงิน</label><input type="text" value={settings.promptpay_number || ""} onChange={(e) => setSettings({...settings, promptpay_number: e.target.value})} className="w-full p-3 border-2 border-green-400 rounded-xl outline-none" /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="block text-sm font-bold text-gray-700 mb-2">หัวข้อ: บิลก่อนจ่ายเงิน (Draft)</label><input type="text" value={settings.invoice_title || ""} onChange={(e) => setSettings({...settings, invoice_title: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" /></div>
            <div><label className="block text-sm font-bold text-gray-700 mb-2">หัวข้อ: บิลหลังจ่ายเงิน (Receipt)</label><input type="text" value={settings.receipt_title || ""} onChange={(e) => setSettings({...settings, receipt_title: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" /></div>
          </div>
          <div><label className="block text-sm font-bold text-gray-700 mb-2">ข้อความท้ายใบเสร็จ (ถาวร)</label><input type="text" value={settings.receipt_footer || ""} onChange={(e) => setSettings({...settings, receipt_footer: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl outline-none" /></div>
          <button type="submit" disabled={isSaving} className="cursor-pointer w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-lg shadow-md transition-all">{isSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าระบบ"}</button>
        </form>

        <div className="bg-red-50 p-6 rounded-3xl border border-red-200 text-center">
          <h3 className="text-lg font-black text-red-700 mb-2">ระบบล้างข้อมูล (Factory Reset)</h3>
          <p className="text-sm text-red-600 mb-4">การทำงานนี้จะลบประวัติการขาย, บิลค้างชำระ, และประวัติการรับเข้า/สต๊อกการ์ดทั้งหมด (แต่ไม่ลบรายชื่อสินค้าและลูกค้า)</p>
          <button onClick={() => setShowResetModal(true)} className="cursor-pointer w-full md:w-auto px-8 py-3 bg-white border-2 border-red-500 text-red-600 hover:bg-red-500 hover:text-white rounded-xl font-bold transition-all">ล้างประวัติทั้งหมด</button>
        </div>
      </div>

      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center">
            <h2 className="text-2xl font-black text-red-600 mb-2">⚠️ ยืนยันการล้างข้อมูล</h2>
            <p className="text-gray-600 text-sm mb-4">พิมพ์คำว่า <span className="font-bold text-red-600">ยืนยัน</span> ในช่องด้านล่างเพื่อดำเนินการ</p>
            <input type="text" value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="พิมพ์ ยืนยัน" className="w-full p-3 border-2 border-red-300 rounded-xl text-center font-bold text-lg outline-none focus:border-red-500 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowResetModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">ยกเลิก</button>
              <button onClick={handleFactoryReset} disabled={isResetting} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 disabled:bg-red-400">{isResetting ? "กำลังล้าง..." : "ตกลงล้างข้อมูล"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}