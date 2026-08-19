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
        const MAX_WIDTH = 400;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.8);
        
        setFormData((prev) => ({ ...prev, image_url: dataUrl }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleOpenModal = (product?: Product) => {
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
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) {
      alert("ไม่พบข้อมูลร้านค้า กรุณาไปที่หน้าตั้งค่าร้านค้าก่อนครับ");
      return;
    }
    setIsSubmitting(true);
    try {
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
        image_url: formData.image_url,
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
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h1 className="text-3xl font-bold text-gray-800">📦 บัญชีรายการสินค้าคงคลัง</h1>
          <div className="flex gap-3">
            <button 
              onClick={() => router.push("/pos")}
              className="cursor-pointer bg-gray-800 hover:bg-gray-900 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-all active:scale-95"
            >
              กลับหน้า POS
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-all active:scale-95"
            >
              + เพิ่ม/แก้ไข สินค้า
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                  <th className="p-4 font-semibold whitespace-nowrap">รูป/ข้อมูลสินค้า</th>
                  <th className="p-4 font-semibold text-center whitespace-nowrap">ราคา (ทุน/ขาย)</th>
                  <th className="p-4 font-semibold text-center whitespace-nowrap">ยอดในคลัง</th>
                  <th className="p-4 font-semibold text-center whitespace-nowrap">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-400 font-medium">ยังไม่มีสินค้าในระบบ กรุณากดปุ่มเพิ่มสินค้า</td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 flex items-center gap-4">
                        {product.image_url ? (
                          <div className="w-20 h-20 bg-white rounded-lg shadow-sm border p-1 flex items-center justify-center relative overflow-hidden">
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" />
                          </div>
                        ) : (
                          <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs border border-gray-200">ไม่มีรูป</div>
                        )}
                        <div>
                          <div className="font-bold text-gray-800 text-lg">{product.name}</div>
                          <div className="text-sm text-gray-500">บาร์โค้ด: {product.barcode || "-"}</div>
                          {product.is_vat_exempt && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-medium mt-1 inline-block shadow-sm">VAT 0%</span>}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="text-red-500 text-sm">ทุน: {product.cost_price.toFixed(2)}</div>
                        <div className="text-blue-600 font-bold text-lg">ขาย: {product.sell_price.toFixed(2)}</div>
                      </td>
                      <td className="p-4 text-center font-bold text-gray-800 text-lg">
                        <span className={product.stock_qty <= 5 ? "text-red-500" : ""}>{product.stock_qty}</span>
                        <span className="text-sm text-gray-500 font-medium ml-1">{product.unit}</span>
                      </td>
                      <td className="p-4 text-center space-x-2 whitespace-nowrap">
                        <button onClick={() => handleOpenModal(product)} className="cursor-pointer text-yellow-600 border border-yellow-400 hover:bg-yellow-50 font-bold px-4 py-2 rounded-lg transition-colors">แก้ไข</button>
                        <button onClick={() => handleDeleteProduct(product.id)} className="cursor-pointer text-red-600 border border-red-400 hover:bg-red-50 font-bold px-4 py-2 rounded-lg transition-colors">ลบ</button>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden my-8">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center relative">
              <h2 className="text-2xl font-bold text-gray-800">{editingId ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}</h2>
              <button onClick={handleCloseModal} className="cursor-pointer text-gray-400 hover:text-gray-600 text-2xl font-bold absolute right-6">✕</button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-6 md:p-8 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">ชื่อสินค้า <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">บาร์โค้ด</label>
                <input type="text" value={formData.barcode} onChange={(e) => setFormData({...formData, barcode: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="สแกนหรือพิมพ์..." />
              </div>
              
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ราคาทุน</label>
                  <input type="number" min="0" step="0.01" value={formData.cost_price === 0 ? "" : formData.cost_price} onChange={(e) => setFormData({...formData, cost_price: Number(e.target.value)})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ราคาขาย (รวม VAT แล้ว) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" required value={formData.sell_price === 0 ? "" : formData.sell_price} onChange={(e) => setFormData({...formData, sell_price: Number(e.target.value)})} className="w-full px-4 py-3 border-2 border-blue-400 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">สต๊อกตั้งต้น <span className="text-red-500">*</span></label>
                  <input type="number" required value={formData.stock_qty === 0 ? "" : formData.stock_qty} onChange={(e) => setFormData({...formData, stock_qty: Number(e.target.value)})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">หน่วยนับ</label>
                  <input type="text" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="เช่น ชิ้น" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">ลำดับโชว์</label>
                  <input type="number" value={formData.sort_order} onChange={(e) => setFormData({...formData, sort_order: Number(e.target.value)})} className="w-full px-4 py-3 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="1, 2, 3..." />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">อัปโหลดรูปภาพ (.jpg, .png)</label>
                <div className="flex items-center gap-4">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full px-4 py-2 border border-gray-300 rounded-xl file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                  {formData.image_url && (
                    <div className="w-12 h-12 relative border rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0">
                      <img src={formData.image_url} alt="Preview" className="w-full h-full object-contain" />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-3 cursor-pointer p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={formData.is_vat_exempt} onChange={(e) => setFormData({...formData, is_vat_exempt: e.target.checked})} className="w-6 h-6 text-blue-600 rounded-md border-gray-300 focus:ring-blue-500 cursor-pointer" />
                  <span className="text-sm font-bold text-gray-700">สินค้าเกษตร/ยกเว้นภาษี (เช่น พวงมาลัย) <span className="text-red-500">(VAT 0%)</span></span>
                </label>
              </div>
              
              <div className="pt-6 flex gap-4">
                <button type="button" onClick={handleCloseModal} className="cursor-pointer flex-1 py-4 bg-white border-2 border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-all">ยกเลิก</button>
                <button type="submit" disabled={isSubmitting} className="cursor-pointer flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200">
                  {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูลสินค้า"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}