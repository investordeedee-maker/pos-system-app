"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../lib/supabase";

interface StoreSettings {
  id: string;
  name: string;
  address: string;
  tax_id: string;
  phone_number: string;
  promptpay_number: string;
  invoice_title: string;
  receipt_title: string;
  accounting_start_date: string;
  accounting_end_date: string;
  receipt_footer: string;
  logo_url: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [formData, setFormData] = useState<StoreSettings>({
    id: "",
    name: "",
    address: "",
    tax_id: "",
    phone_number: "",
    promptpay_number: "",
    invoice_title: "ใบแจ้งหนี้",
    receipt_title: "ใบเสร็จรับเงิน",
    accounting_start_date: "",
    accounting_end_date: "",
    receipt_footer: "ขอขอบคุณที่มาอุดหนุนและใช้บริการ",
    logo_url: "",
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStoreData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (isMounted) router.push("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("store_id")
          .eq("id", user.id)
          .single();

        if (profile?.store_id && isMounted) {
          setStoreId(profile.store_id);
          const { data: storeData } = await supabase
            .from("stores")
            .select("*")
            .eq("id", profile.store_id)
            .single();

          if (storeData) {
            setFormData({
              id: storeData.id,
              name: storeData.name || "",
              address: storeData.address || "",
              tax_id: storeData.tax_id || "",
              phone_number: storeData.phone_number || "",
              promptpay_number: storeData.promptpay_number || "",
              invoice_title: storeData.invoice_title || "ใบแจ้งหนี้",
              receipt_title: storeData.receipt_title || "ใบเสร็จรับเงิน",
              accounting_start_date: storeData.accounting_start_date || "",
              accounting_end_date: storeData.accounting_end_date || "",
              receipt_footer: storeData.receipt_footer || "ขอขอบคุณที่มาอุดหนุนและใช้บริการ",
              logo_url: storeData.logo_url || "",
            });
          }
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStoreData();
    return () => { isMounted = false; };
  }, [router]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 200; // ย่อขนาดโลโก้ให้พอดีกับสลิป
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png", 0.9);
        
        setFormData((prev) => ({ ...prev, logo_url: dataUrl }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("stores")
        .update({
          name: formData.name,
          address: formData.address,
          tax_id: formData.tax_id,
          phone_number: formData.phone_number,
          promptpay_number: formData.promptpay_number,
          invoice_title: formData.invoice_title,
          receipt_title: formData.receipt_title,
          accounting_start_date: formData.accounting_start_date || null,
          accounting_end_date: formData.accounting_end_date || null,
          receipt_footer: formData.receipt_footer,
          logo_url: formData.logo_url,
        })
        .eq("id", storeId);

      if (error) throw error;
      alert("บันทึกการตั้งค่าระบบเรียบร้อยแล้ว");
    } catch (error: unknown) {
      if (error instanceof Error) alert("เกิดข้อผิดพลาดในการบันทึก: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFactoryReset = async () => {
    if (!storeId) return;
    const confirmText = prompt("พิมพ์คำว่า 'ยืนยัน' เพื่อทำการลบประวัติการขายและรีเซ็ตสต็อกเป็น 0");
    if (confirmText !== "ยืนยัน") return;

    setIsResetting(true);
    try {
      const { data: orders } = await supabase.from("orders").select("id").eq("store_id", storeId);
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        await supabase.from("order_items").delete().in("order_id", orderIds);
        await supabase.from("orders").delete().eq("store_id", storeId);
      }
      await supabase.from("products").update({ stock_qty: 0 }).eq("store_id", storeId);
      alert("✅ ล้างประวัติการขายและรีเซ็ตสต็อกเป็น 0 สำเร็จเรียบร้อยแล้ว!");
    } catch (error: unknown) {
      if (error instanceof Error) alert("เกิดข้อผิดพลาด: " + error.message);
    } finally {
      setIsResetting(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-10">
      <div className="bg-gray-900 text-white p-4 flex justify-between items-center shadow-md">
        <div className="font-bold text-lg px-4">⚙️ การตั้งค่าระบบจัดการร้าน</div>
        <div className="flex gap-2">
          <button onClick={() => router.push("/pos")} className="px-4 py-2 hover:bg-gray-800 rounded-lg transition-colors text-sm font-medium">หน้าจอขาย (POS)</button>
          <button onClick={() => router.push("/products")} className="px-4 py-2 hover:bg-gray-800 rounded-lg transition-colors text-sm font-medium">คลังสินค้า</button>
          <button className="px-4 py-2 bg-blue-600 rounded-lg font-bold text-sm shadow-sm">ตั้งค่าระบบ</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto mt-8 px-4">
        <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          <div className="p-8 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
            <h2 className="text-2xl font-black text-blue-800">ข้อมูลบริษัท & ใบเสร็จ</h2>
            <p className="text-sm text-gray-500 mt-1">ปรับแต่งข้อมูลที่จะแสดงในเอกสารใบแจ้งหนี้และใบเสร็จรับเงิน</p>
          </div>

          <div className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">โลโก้ร้านค้า/บริษัท (.jpg, .png พื้นหลังใส)</label>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full md:w-auto px-4 py-3 border border-gray-300 rounded-xl cursor-pointer" />
              {formData.logo_url && (
                <div className="mt-4 flex items-center gap-6 p-4 border border-gray-100 rounded-2xl bg-gray-50 w-fit">
                  <div className="w-20 h-20 relative bg-white border border-gray-200 rounded-xl overflow-hidden flex items-center justify-center p-1">
                    <Image src={formData.logo_url} alt="Logo" fill className="object-contain" unoptimized />
                  </div>
                  <button type="button" onClick={() => setFormData(p => ({...p, logo_url: ""}))} className="px-4 py-2 text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg font-bold text-sm">ลบโลโก้</button>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อบริษัทจดทะเบียน <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 border border-blue-200 font-bold text-blue-900 rounded-xl outline-none" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">ที่อยู่บริษัท <span className="text-red-500">*</span></label>
                <textarea required rows={3} value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none resize-none" />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">เบอร์โทรศัพท์ (แสดงบนใบเสร็จ)</label>
                <input type="text" value={formData.phone_number} onChange={(e) => setFormData({...formData, phone_number: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none" />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">เลขประจำตัวผู้เสียภาษี</label>
                <input type="text" value={formData.tax_id} onChange={(e) => setFormData({...formData, tax_id: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none" />
              </div>

              <div className="md:col-span-2 pt-2 border-t border-gray-100">
                <label className="block text-sm font-bold text-green-700 mb-2">PromptPay สำหรับรับเงิน (เบอร์โทร หรือ เลขบัตร ปชช.)</label>
                <input type="text" value={formData.promptpay_number} onChange={(e) => setFormData({...formData, promptpay_number: e.target.value})} className="w-full px-4 py-3 border-2 border-green-400 text-green-900 font-bold rounded-xl outline-none" placeholder="เช่น 0816115221" />
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-bold text-gray-700 mb-2">หัวข้อ: บิลก่อนจ่ายเงิน (Draft)</label>
                <input type="text" value={formData.invoice_title} onChange={(e) => setFormData({...formData, invoice_title: e.target.value})} className="w-full px-4 py-3 border border-cyan-400 rounded-xl outline-none" />
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-bold text-gray-700 mb-2">หัวข้อ: บิลหลังจ่ายเงิน (Receipt)</label>
                <input type="text" value={formData.receipt_title} onChange={(e) => setFormData({...formData, receipt_title: e.target.value})} className="w-full px-4 py-3 border border-blue-400 rounded-xl outline-none" />
              </div>

              <div className="md:col-span-2 pt-2 border-t border-gray-100">
                <label className="block text-sm font-bold text-cyan-600 mb-2">ข้อความท้ายใบเสร็จ (ถาวร)</label>
                <input type="text" value={formData.receipt_footer} onChange={(e) => setFormData({...formData, receipt_footer: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none" />
              </div>
            </div>

            <div className="pt-6">
              <button type="submit" disabled={isSubmitting} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg text-lg">
                {isSubmitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่าระบบ"}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-8 bg-red-50 border-2 border-red-200 rounded-3xl p-8 shadow-sm">
          <h3 className="text-xl font-black text-red-700 mb-2">ระบบล้างข้อมูล (Factory Reset)</h3>
          <button type="button" onClick={handleFactoryReset} disabled={isResetting} className="w-full border-2 border-red-400 text-red-700 hover:bg-red-600 hover:text-white font-bold py-4 rounded-xl transition-all">
            {isResetting ? "กำลังล้างข้อมูล..." : "ยืนยันการล้างประวัติทั้งหมด"}
          </button>
        </div>
      </div>
    </div>
  );
}