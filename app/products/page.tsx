"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Product { id: string; store_id: string; barcode: string; name: string; cost_price: number; sell_price: number; stock_qty: number; unit: string; sort_order: number; is_vat_exempt: boolean; image_url: string; }

export default function ProductsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    barcode: "", name: "", cost_price: 0, sell_price: 0, stock_qty: 0, unit: "ชิ้น", sort_order: 1, is_vat_exempt: false, image_url: "",
  });

  const loadProducts = async (currentStoreId: string) => {
    const { data } = await supabase.from("products").select("*").eq("store_id", currentStoreId).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (data) setProducts(data);
  };

  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (isMounted) router.push("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (profile?.store_id && isMounted) { setStoreId(profile.store_id); await loadProducts(profile.store_id); }
      } catch { } finally { if (isMounted) setLoading(false); }
    };
    initData(); return () => { isMounted = false; };
  }, [router]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingId(product.id);
      setFormData({ barcode: product.barcode || "", name: product.name, cost_price: product.cost_price, sell_price: product.sell_price, stock_qty: product.stock_qty, unit: product.unit || "ชิ้น", sort_order: product.sort_order || 1, is_vat_exempt: product.is_vat_exempt, image_url: product.image_url || "" });
    } else {
      setEditingId(null);
      setFormData({ barcode: "", name: "", cost_price: 0, sell_price: 0, stock_qty: 0, unit: "ชิ้น", sort_order: 1, is_vat_exempt: false, image_url: "" });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => { setIsModalOpen(false); setEditingId(null); };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) { alert("ไม่พบข้อมูลร้านค้า"); return; }
    setIsSubmitting(true);
    try {
      const productData = { store_id: storeId, barcode: formData.barcode, name: formData.name, cost_price: formData.cost_price, sell_price: formData.sell_price, stock_qty: formData.stock_qty, unit: formData.unit, sort_order: formData.sort_order, is_vat_exempt: formData.is_vat_exempt, image_url: formData.image_url };
      if (editingId) await supabase.from("products").update(productData).eq("id", editingId);
      else await supabase.from("products").insert([productData]);
      await loadProducts(storeId); handleCloseModal();
    } catch { } finally { setIsSubmitting(false); }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!storeId) return;
    if (!confirm("ลบสินค้านี้ใช่หรือไม่?")) return;
    try { await supabase.from("products").delete().eq("id", id); await loadProducts(storeId); } catch { }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h1 className="text-3xl font-bold text-gray-800">📦 คลังสินค้า</h1>
          <div className="flex gap-3">
            <button onClick={() => router.push("/")} className="bg-gray-800 text-white px-6 py-3 rounded-lg font-bold shadow-md cursor-pointer">กลับหน้าหลัก</button>
            <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-md cursor-pointer">+ เพิ่มสินค้า</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm border-b">
                <th className="p-4 font-semibold">ชื่อสินค้า</th>
                <th className="p-4 font-semibold text-center">ราคา (ขาย)</th>
                <th className="p-4 font-semibold text-center">ยอดคงเหลือ</th>
                <th className="p-4 font-semibold text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">ยังไม่มีสินค้าในระบบ</td></tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-bold text-gray-800 text-lg">{product.name}</div>
                      {product.is_vat_exempt && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full mt-1 inline-block">VAT 0%</span>}
                    </td>
                    <td className="p-4 text-center font-bold text-blue-600 text-lg">{product.sell_price.toFixed(2)}</td>
                    <td className="p-4 text-center font-bold text-gray-800 text-lg">{product.stock_qty}</td>
                    <td className="p-4 text-center space-x-2">
                      <button onClick={() => handleOpenModal(product)} className="text-yellow-600 border border-yellow-400 font-bold px-4 py-2 rounded-lg cursor-pointer">แก้ไข</button>
                      <button onClick={() => handleDeleteProduct(product.id)} className="text-red-600 border border-red-400 font-bold px-4 py-2 rounded-lg cursor-pointer">ลบ</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl my-8">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-2xl font-bold">{editingId ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</h2>
              <button onClick={handleCloseModal} className="text-2xl font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-6 space-y-5">
              <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 border rounded-xl" placeholder="ชื่อสินค้า *" />
              <input type="number" step="0.01" required value={formData.sell_price === 0 ? "" : formData.sell_price} onChange={(e) => setFormData({...formData, sell_price: Number(e.target.value)})} className="w-full px-4 py-3 border border-blue-400 rounded-xl" placeholder="ราคาขาย *" />
              <input type="number" required value={formData.stock_qty === 0 ? "" : formData.stock_qty} onChange={(e) => setFormData({...formData, stock_qty: Number(e.target.value)})} className="w-full px-4 py-3 border rounded-xl" placeholder="สต๊อกตั้งต้น *" />
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" checked={formData.is_vat_exempt} onChange={(e) => setFormData({...formData, is_vat_exempt: e.target.checked})} className="w-6 h-6 text-blue-600 rounded-md cursor-pointer" />
                <span className="text-sm font-bold text-gray-700">สินค้าเกษตร/ยกเว้นภาษี (VAT 0%)</span>
              </label>
              <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold cursor-pointer">บันทึกสินค้า</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}