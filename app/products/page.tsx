"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Product {
  id: string;
  store_id: string;
  barcode: string;
  name: string;
  cost_price: number;
  sell_price: number;
  stock_qty: number;
  unit: string;
  sort_order: number;
  is_vat_exempt: boolean;
  image_url: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // เพิ่ม State สำหรับเก็บไฟล์รูปภาพจริงๆ ก่อนอัปโหลด
  const [imageFile, setImageFile] = useState<Blob | null>(null);

  const [formData, setFormData] = useState({
    barcode: "",
    name: "",
    cost_price: 0,
    sell_price: 0,
    stock_qty: 0,
    unit: "ชิ้น",
    sort_order: 1,
    is_vat_exempt: false,
    image_url: "",
  });

  const loadProducts = async (currentStoreId: string) => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("store_id", currentStoreId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      alert("โหลดข้อมูลสินค้าไม่สำเร็จ: " + error.message);
    } else if (data) {
      setProducts(data);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
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
          await loadProducts(profile.store_id);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    initData();
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
        const MAX_WIDTH = 600;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // แปลงเป็น Blob (ไฟล์รูปภาพ) เพื่อเตรียมอัปโหลดเข้า Storage
        canvas.toBlob((blob) => {
          if (blob) {
            setImageFile(blob);
            // สร้าง URL จำลองเพื่อแสดงพรีวิวให้แอดมินเห็นก่อน
            setFormData((prev) => ({ ...prev, image_url: URL.createObjectURL(blob) }));
          }
        }, "image/jpeg", 0.8);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleOpenModal = (product?: Product) => {
    setImageFile(null); // ล้างไฟล์ที่ค้างอยู่
    if (product) {
      setEditingId(product.id);
      setFormData({
        barcode: product.barcode || "",
        name: product.name,
        cost_price: product.cost_price,
        sell_price: product.sell_price,
        stock_qty: product.stock_qty,
        unit: product.unit || "ชิ้น",
        sort_order: product.sort_order || 1,
        is_vat_exempt: product.is_vat_exempt,
        image_url: product.image_url || "",
      });
    } else {
      setEditingId(null);
      setFormData({
        barcode: "",
        name: "",
        cost_price: 0,
        sell_price: 0,
        stock_qty: 0,
        unit: "ชิ้น",
        sort_order: 1,
        is_vat_exempt: false,
        image_url: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setImageFile(null);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) {
      alert("ไม่พบข้อมูลร้านค้า กรุณาไปที่หน้าตั้งค่าร้านค้าก่อนครับ");
      return;
    }
    setIsSubmitting(true);
    try {
      let finalImageUrl = formData.image_url;

      // ถ้ามีการเลือกรูปใหม่ ให้อัปโหลดเข้า Storage ก่อน
      if (imageFile) {
        const fileName = `products/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(fileName, imageFile, { contentType: 'image/jpeg' });
          
        if (uploadError) {
          alert("อัปโหลดรูปภาพไม่สำเร็จ: " + uploadError.message);
          setIsSubmitting(false);
          return;
        }
        
        // ดึงลิงก์ URL สาธารณะมาใช้งาน
        const { data: publicUrlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }

      const productData = {
        store_id: storeId,
        barcode: formData.barcode,
        name: formData.name,
        cost_price: formData.cost_price,
        sell_price: formData.sell_price,
        stock_qty: formData.stock_qty,
        unit: formData.unit,
        sort_order: formData.sort_order,
        is_vat_exempt: formData.is_vat_exempt, 
        image_url: finalImageUrl, // บันทึกแค่ URL สั้นๆ ลง DB
      };

      if (editingId) {
        const { error } = await supabase.from("products").update(productData).eq("id", editingId);
        if (error) throw error;
        alert("อัปเดตสินค้าสำเร็จ");
      } else {
        const { error } = await supabase.from("products").insert([productData]);
        if (error) throw error;
        alert("เพิ่มสินค้าสำเร็จ");
      }
      await loadProducts(storeId);
      handleCloseModal();
    } catch (error: unknown) {
      if (error instanceof Error) {
        alert("บันทึกไม่สำเร็จ: " + error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!storeId) return;
    if (!confirm("คุณต้องการลบสินค้านี้จากระบบใช่หรือไม่?")) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      alert("ลบสินค้าสำเร็จ");
      await loadProducts(storeId);
    } catch (error: unknown) {
      if (error instanceof Error) alert("ลบไม่สำเร็จ: " + error.message);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดระบบคลังสินค้า...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            📦 บัญชีรายการสินค้าคงคลัง
          </h1>
          <div className="flex flex-wrap gap-2 sm:gap-3 justify-center w-full lg:w-auto">
            <button onClick={() => router.push("/")} className="cursor-pointer bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2 text-sm sm:text-base">🏠 หน้าหลัก</button>
            <button onClick={() => router.push("/pos")} className="cursor-pointer bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2 text-sm sm:text-base">🛒 กลับหน้า POS</button>
            <button onClick={() => handleOpenModal()} className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2 text-sm sm:text-base">➕ เพิ่มสินค้า</button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                  <th className="p-5 font-bold whitespace-nowrap">รูป/ข้อมูลสินค้า</th>
                  <th className="p-5 font-bold text-center whitespace-nowrap">ราคา (ทุน/ขาย)</th>
                  <th className="p-5 font-bold text-center whitespace-nowrap">ยอดในคลัง</th>
                  <th className="p-5 font-bold text-center whitespace-nowrap">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-gray-400 font-medium bg-gray-50/50">ยังไม่มีสินค้าในระบบ กรุณากดปุ่มเพิ่มสินค้า</td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="p-5 flex items-center gap-4">
                        {product.image_url ? (
                          <div className="w-20 h-20 bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex items-center justify-center relative overflow-hidden shrink-0">
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" />
                          </div>
                        ) : (
                          <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs border border-gray-200 shrink-0 font-medium">ไม่มีรูป</div>
                        )}
                        <div>
                          <div className="font-black text-gray-800 text-lg leading-snug">{product.name}</div>
                          <div className="text-sm text-gray-500 mt-0.5">บาร์โค้ด: <span className="font-medium text-gray-700">{product.barcode || "-"}</span></div>
                          {product.is_vat_exempt && <span className="text-[10px] bg-red-100 border border-red-200 text-red-600 px-2 py-0.5 rounded-md font-bold mt-1.5 inline-block shadow-sm">VAT 0%</span>}
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        <div className="text-gray-500 text-sm font-medium">ทุน: {product.cost_price.toFixed(2)}</div>
                        <div className="text-blue-600 font-black text-lg mt-0.5">ขาย: {product.sell_price.toFixed(2)}</div>
                      </td>
                      <td className="p-5 text-center">
                        <div className="inline-flex items-center justify-center bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl">
                          <span className={`font-black text-xl ${product.stock_qty <= 5 ? "text-red-500" : "text-gray-800"}`}>{product.stock_qty}</span>
                          <span className="text-sm text-gray-500 font-bold ml-1.5">{product.unit}</span>
                        </div>
                      </td>
                      <td className="p-5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleOpenModal(product)} className="cursor-pointer text-yellow-700 bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 font-bold px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95 text-sm">แก้ไข</button>
                          <button onClick={() => handleDeleteProduct(product.id)} className="cursor-pointer text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 font-bold px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95 text-sm">ลบ</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl overflow-hidden my-8 border border-gray-100 animate-fade-in-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center relative bg-gray-50/50">
              <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                {editingId ? "✏️ แก้ไขข้อมูลสินค้า" : "📦 เพิ่มสินค้าใหม่"}
              </h2>
              <button onClick={handleCloseModal} className="cursor-pointer bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-600 w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold shadow-sm border border-gray-200 transition-all absolute right-6">✕</button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-6 md:p-8 space-y-5 bg-white">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ชื่อสินค้า <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-bold text-gray-800 bg-gray-50 focus:bg-white" placeholder="กรอกชื่อสินค้า..." />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">บาร์โค้ด</label>
                <input type="text" value={formData.barcode} onChange={(e) => setFormData({...formData, barcode: e.target.value})} className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-bold text-gray-800 bg-gray-50 focus:bg-white" placeholder="สแกนหรือพิมพ์..." />
              </div>
              
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ราคาทุน</label>
                  <input type="number" min="0" step="0.01" value={formData.cost_price === 0 ? "" : formData.cost_price} onChange={(e) => setFormData({...formData, cost_price: Number(e.target.value)})} className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-bold text-gray-800 bg-gray-50 focus:bg-white" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ราคาขาย <span className="normal-case font-medium text-gray-400">(รวม VAT แล้ว)</span> <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" required value={formData.sell_price === 0 ? "" : formData.sell_price} onChange={(e) => setFormData({...formData, sell_price: Number(e.target.value)})} className="w-full px-4 py-3.5 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-black text-blue-600 bg-blue-50 focus:bg-white" placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">สต๊อกตั้งต้น <span className="text-red-500">*</span></label>
                  <input type="number" required value={formData.stock_qty === 0 ? "" : formData.stock_qty} onChange={(e) => setFormData({...formData, stock_qty: Number(e.target.value)})} className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-gray-800 bg-gray-50 focus:bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">หน่วยนับ</label>
                  <input type="text" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-gray-800 bg-gray-50 focus:bg-white" placeholder="เช่น ชิ้น" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ลำดับโชว์</label>
                  <input type="number" value={formData.sort_order} onChange={(e) => setFormData({...formData, sort_order: Number(e.target.value)})} className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-gray-800 bg-gray-50 focus:bg-white" placeholder="1, 2, 3..." />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">อัปโหลดรูปภาพ <span className="normal-case font-medium text-gray-400">(.jpg, .png)</span></label>
                <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-xl border border-gray-200">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full px-2 py-1 file:mr-4 file:py-2.5 file:px-5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-white file:text-blue-700 hover:file:bg-blue-50 file:shadow-sm cursor-pointer text-sm text-gray-500" />
                  {formData.image_url && (
                    <div className="w-14 h-14 relative border border-gray-200 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-sm mr-2">
                      <img src={formData.image_url} alt="Preview" className="w-full h-full object-contain p-1" />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start space-x-3 cursor-pointer p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors bg-white">
                  <input type="checkbox" checked={formData.is_vat_exempt} onChange={(e) => setFormData({...formData, is_vat_exempt: e.target.checked})} className="mt-0.5 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer" />
                  <div>
                    <span className="text-sm font-bold text-gray-800 block">สินค้าเกษตร/ยกเว้นภาษี (VAT 0%)</span>
                    <span className="text-xs font-medium text-gray-500 mt-0.5 block">สำหรับสินค้าที่ได้รับการยกเว้นภาษีมูลค่าเพิ่มตามกฎหมาย (เช่น พวงมาลัย)</span>
                  </div>
                </label>
              </div>
              
              <div className="pt-6 flex gap-3">
                <button type="button" onClick={handleCloseModal} className="cursor-pointer flex-1 py-4 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 hover:text-gray-900 transition-all text-sm active:scale-95 shadow-sm">ยกเลิก</button>
                <button type="submit" disabled={isSubmitting} className="cursor-pointer flex-[2] py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold transition-all shadow-md shadow-blue-600/20 active:scale-95 text-base flex items-center justify-center gap-2">
                  {isSubmitting ? "⏳ กำลังบันทึก..." : "✅ บันทึกข้อมูลสินค้า"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}