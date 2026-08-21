"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Product { id: string; name: string; stock_qty: number; cost_price: number; }
interface Supplier { id: string; code: string; name: string; }
interface Transaction { id: string; transaction_type: string; quantity: number; balance_after: number; reference_doc: string; notes: string; created_at: string; doc_date: string; products: { name: string }; inventory_lots?: { lot_number: string }; suppliers?: { name: string } }

export default function InventoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"MANAGE" | "STOCK_CARD">("MANAGE");
  
  // States สำหรับฟอร์มจัดการสต๊อก
  const [actionType, setActionType] = useState<"IN" | "ADJUST">("IN");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  const [selectedProductId, setSelectedProductId] = useState("");
  const [docDate, setDocDate] = useState(new Date().toISOString().split("T")[0]);
  const [docNo, setDocNo] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  
  // สำหรับ รับเข้า (IN)
  const [lotNo, setLotNo] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expDate, setExpDate] = useState("");
  const [supplierInput, setSupplierInput] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  // สำหรับ ปรับปรุง (ADJUST)
  const [adjustReason, setAdjustReason] = useState("ของเสียหาย");

  const [isProcessing, setIsProcessing] = useState(false);

  // States สำหรับ Stock Card
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterProductId, setFilterProductId] = useState("ALL");

  // 🛠️ ย้ายฟังก์ชันต่างๆ ขึ้นมาไว้ก่อน useEffect เพื่อแก้ปัญหา Cannot access variable before it is declared
  const fetchProducts = async (sId: string) => {
    const { data } = await supabase.from("products").select("id, name, stock_qty, cost_price").eq("store_id", sId).order("name");
    if (data) setProducts(data);
  };

  const fetchSuppliers = async (sId: string) => {
    const { data } = await supabase.from("suppliers").select("id, code, name").eq("store_id", sId).order("name");
    if (data) setSuppliers(data);
  };

  const fetchTransactions = async (sId: string, pId: string) => {
    let query = supabase.from("inventory_transactions").select(`*, products(name), inventory_lots(lot_number), suppliers(name)`).eq("store_id", sId).order("created_at", { ascending: false }).limit(100);
    if (pId !== "ALL") query = query.eq("product_id", pId);
    
    const { data } = await query;
    if (data) setTransactions(data);
  };

  const handleFilterChange = (pId: string) => {
    setFilterProductId(pId);
    if (storeId) fetchTransactions(storeId, pId);
  };

  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      
      const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
      if (profile?.store_id && isMounted) {
        setStoreId(profile.store_id);
        // ตอนนี้เรียกใช้ฟังก์ชันได้แล้วเพราะฟังก์ชันถูกสร้างไว้ด้านบนแล้ว
        fetchProducts(profile.store_id);
        fetchSuppliers(profile.store_id);
        fetchTransactions(profile.store_id, "ALL");
      }
      if (isMounted) setLoading(false);
    };
    initData();
    return () => { isMounted = false; };
  }, [router]);

  const handleSupplierSearch = (input: string) => {
    setSupplierInput(input);
    const found = suppliers.find(s => s.code.includes(input) || s.name.includes(input));
    setSelectedSupplier(found || null);
  };

  const resetForm = () => {
    setQty(""); setCost(""); setNotes(""); setDocNo(""); setLotNo(""); setMfgDate(""); setExpDate("");
    setSupplierInput(""); setSelectedSupplier(null);
  };

  const handleManageStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !selectedProductId || !qty || Number(qty) <= 0) {
      alert("กรุณาเลือกสินค้าและระบุจำนวนให้ถูกต้อง"); return;
    }
    
    setIsProcessing(true);
    try {
      const quantityNum = parseInt(qty);
      const product = products.find(p => p.id === selectedProductId);
      const currentStock = product?.stock_qty || 0;
      let newBalance = currentStock;
      
      const referenceDoc = docNo || `${actionType === 'IN' ? 'RCV' : 'ADJ'}${new Date().getTime().toString().slice(-6)}`;

      if (actionType === "IN") {
        newBalance = currentStock + quantityNum;
        let finalSupplierId = selectedSupplier?.id || null;

        // ถ้าพิมพ์ชื่อ Supplier ใหม่ที่ไม่มีในระบบ ให้บันทึกใหม่ทันที
        if (supplierInput && !selectedSupplier) {
          const { data: newSup } = await supabase.from("suppliers").insert([{
            store_id: storeId, code: `SUP-${new Date().getTime().toString().slice(-4)}`, name: supplierInput
          }]).select("id").single();
          if (newSup) { finalSupplierId = newSup.id; fetchSuppliers(storeId); }
        }

        let lotId = null;
        if (lotNo) {
          const { data: lotData } = await supabase.from("inventory_lots").insert([{
            store_id: storeId, product_id: selectedProductId, lot_number: lotNo,
            quantity_received: quantityNum, quantity_remaining: quantityNum, cost_price: Number(cost) || 0,
            manufacture_date: mfgDate || null, expiry_date: expDate || null
          }]).select("id").single();
          if (lotData) lotId = lotData.id;
        }

        await supabase.from("products").update({ stock_qty: newBalance }).eq("id", selectedProductId);
        await supabase.from("inventory_transactions").insert([{
          store_id: storeId, product_id: selectedProductId, lot_id: lotId, supplier_id: finalSupplierId,
          transaction_type: "IN", quantity: quantityNum, balance_after: newBalance,
          reference_doc: referenceDoc, doc_date: docDate, notes: notes || "รับเข้าสินค้า"
        }]);

        alert("บันทึกรับเข้าสินค้าเรียบร้อยแล้ว");

      } else if (actionType === "ADJUST") {
        newBalance = currentStock - quantityNum;
        if (newBalance < 0) { alert("ยอดคงเหลือไม่พอให้ตัดออก!"); setIsProcessing(false); return; }

        await supabase.from("products").update({ stock_qty: newBalance }).eq("id", selectedProductId);
        await supabase.from("inventory_transactions").insert([{
          store_id: storeId, product_id: selectedProductId,
          transaction_type: "ADJUST", quantity: quantityNum, balance_after: newBalance,
          reference_doc: referenceDoc, doc_date: docDate, notes: `${adjustReason} ${notes ? '- '+notes : ''}`
        }]);

        alert("บันทึกรายการปรับปรุงยอดเรียบร้อยแล้ว");
      }

      resetForm();
      fetchProducts(storeId);
      if (activeTab === "STOCK_CARD") fetchTransactions(storeId, filterProductId);
      
    } catch (err) { console.error(err); alert("เกิดข้อผิดพลาดในการบันทึก"); } 
    finally { setIsProcessing(false); }
  };

  // คำนวณยอดยกมา (Brought Forward)
  let broughtForward = 0;
  if (transactions.length > 0) {
    const oldestTxn = transactions[transactions.length - 1];
    if (oldestTxn.transaction_type === "IN") {
      broughtForward = oldestTxn.balance_after - oldestTxn.quantity;
    } else {
      broughtForward = oldestTxn.balance_after + oldestTxn.quantity;
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-gray-800">📦 ระบบจัดการคลังสินค้า (Inventory)</h1>
            <p className="text-sm text-gray-500 mt-1">รับเข้า ตัดจ่าย คุม Lot และ Stock Card</p>
          </div>
          <button onClick={() => router.push("/")} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">🏠 กลับหน้าหลัก</button>
        </div>

        <div className="flex gap-4">
          <button onClick={() => { setActiveTab("MANAGE"); if(storeId) fetchProducts(storeId); }} className={`flex-1 py-4 rounded-2xl font-bold text-lg transition-all ${activeTab === "MANAGE" ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
            📥 รับเข้า / ตัดจ่ายสินค้า
          </button>
          <button onClick={() => { setActiveTab("STOCK_CARD"); if(storeId) fetchTransactions(storeId, filterProductId); }} className={`flex-1 py-4 rounded-2xl font-bold text-lg transition-all ${activeTab === "STOCK_CARD" ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
            📊 Stock Card (ความเคลื่อนไหว)
          </button>
        </div>

        {activeTab === "MANAGE" && (
          <form onSubmit={handleManageStock} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-fade-in">
            <div className="flex gap-2 mb-6 border-b pb-4">
              <button type="button" onClick={() => { setActionType("IN"); resetForm(); }} className={`cursor-pointer px-6 py-2 rounded-xl font-bold transition-all ${actionType === "IN" ? "bg-green-100 text-green-700 border-2 border-green-500" : "bg-gray-50 text-gray-500 border-2 border-transparent"}`}>➕ รับของเข้า (IN)</button>
              <button type="button" onClick={() => { setActionType("ADJUST"); resetForm(); }} className={`cursor-pointer px-6 py-2 rounded-xl font-bold transition-all ${actionType === "ADJUST" ? "bg-orange-100 text-orange-700 border-2 border-orange-500" : "bg-gray-50 text-gray-500 border-2 border-transparent"}`}>➖ ปรับปรุง/ตัดจ่าย (ADJUST)</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">เลือกสินค้า *</label>
                  <select required value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500 bg-gray-50">
                    <option value="" disabled>-- เลือกสินค้า --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (คงเหลือ: {p.stock_qty})</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-2">วันที่เอกสาร</label>
                    <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-2">เลขที่อ้างอิง</label>
                    <input type="text" value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="เว้นว่างเพื่อสร้างอัตโนมัติ" className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500" />
                  </div>
                </div>
                
                {actionType === "ADJUST" && (
                  <div>
                    <label className="block text-sm font-bold text-orange-700 mb-2">สาเหตุการปรับปรุง *</label>
                    <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full p-3 border border-orange-300 rounded-xl outline-none bg-orange-50">
                      <option value="ของเสียหาย">ของเสียหาย (ชำรุด)</option>
                      <option value="จำหน่ายออก">จำหน่ายออก (ทิ้ง/แจก)</option>
                      <option value="สูญหาย">สูญหาย (เช็คสต๊อกไม่เจอ)</option>
                      <option value="อื่นๆ">อื่นๆ</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-2">จำนวน {actionType === "IN" ? "รับเข้า" : "ตัดออก"} *</label>
                    <input type="number" required min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500" placeholder="ระบุจำนวน" />
                  </div>
                  {actionType === "IN" && (
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-gray-700 mb-2">ต้นทุน/หน่วย</label>
                      <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500" placeholder="ระบุต้นทุน" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">หมายเหตุเพิ่มเติม</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500" placeholder="คำอธิบาย..." />
                </div>
              </div>

              {actionType === "IN" && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                    <h3 className="font-bold text-blue-800 mb-3">ผู้จัดจำหน่าย (Supplier)</h3>
                    <input type="text" value={supplierInput} onChange={(e) => handleSupplierSearch(e.target.value)} placeholder="พิมพ์ชื่อบริษัท/รหัส (ระบบจะจำให้ถ้าเป็นชื่อใหม่)" className="w-full p-3 border border-blue-200 rounded-xl outline-none focus:border-blue-500 bg-white" />
                    {selectedSupplier && <p className="text-xs text-green-600 font-bold mt-2">✅ พบข้อมูล: {selectedSupplier.code}</p>}
                  </div>

                  <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100">
                    <h3 className="font-bold text-orange-800 mb-3">ระบบคุม Lot (ทางเลือก)</h3>
                    <div className="space-y-3">
                      <div><label className="block text-xs font-bold text-orange-700 mb-1">รหัส Lot</label><input type="text" value={lotNo} onChange={(e) => setLotNo(e.target.value)} className="w-full p-2.5 border border-orange-200 rounded-lg outline-none" /></div>
                      <div className="flex gap-4">
                        <div className="flex-1"><label className="block text-xs font-bold text-orange-700 mb-1">วันที่ผลิต (MFG)</label><input type="date" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} className="w-full p-2.5 border border-orange-200 rounded-lg outline-none" /></div>
                        <div className="flex-1"><label className="block text-xs font-bold text-orange-700 mb-1">หมดอายุ (EXP)</label><input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="w-full p-2.5 border border-orange-200 rounded-lg outline-none" /></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 border-t pt-6">
              <button type="submit" disabled={isProcessing} className={`cursor-pointer w-full py-4 text-white rounded-xl font-black text-lg shadow-lg transition-all active:scale-95 disabled:bg-gray-400 ${actionType === 'IN' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                {isProcessing ? "กำลังบันทึก..." : (actionType === 'IN' ? "📥 บันทึกรับเข้าสินค้า" : "📤 บันทึกตัดยอดสินค้า")}
              </button>
            </div>
          </form>
        )}

        {activeTab === "STOCK_CARD" && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">รายงานสินค้าเคลื่อนไหว (Stock Card)</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-500">กรองตามสินค้า:</span>
                <select value={filterProductId} onChange={(e) => handleFilterChange(e.target.value)} className="p-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500">
                  <option value="ALL">ดูทุกรายการ</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm border-b-2 border-gray-200">
                    <th className="p-3 font-bold">วันที่เอกสาร</th>
                    <th className="p-3 font-bold">สินค้า</th>
                    <th className="p-3 font-bold">ประเภทรายการ</th>
                    <th className="p-3 font-bold text-center">จำนวน</th>
                    <th className="p-3 font-bold text-center">ยอดคงเหลือ</th>
                    <th className="p-3 font-bold">แหล่งที่มา / อ้างอิง</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length > 0 && filterProductId !== "ALL" && (
                    <tr className="bg-blue-50 border-b border-blue-100">
                      <td colSpan={4} className="p-3 text-right font-bold text-blue-800">ยอดยกมา (Brought Forward) :</td>
                      <td className="p-3 text-center font-black text-blue-800 text-lg">{broughtForward}</td>
                      <td></td>
                    </tr>
                  )}
                  {transactions.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-gray-400">ยังไม่มีประวัติความเคลื่อนไหว</td></tr>
                  ) : (
                    transactions.map((txn) => (
                      <tr key={txn.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                        <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{txn.doc_date ? new Date(txn.doc_date).toLocaleDateString('th-TH') : new Date(txn.created_at).toLocaleDateString('th-TH')}</td>
                        <td className="p-3 text-sm font-bold text-gray-800">{txn.products?.name}</td>
                        <td className="p-3">
                          {txn.transaction_type === "IN" && <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-lg">รับเข้า (IN)</span>}
                          {txn.transaction_type === "OUT" && <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded-lg">ขายออก (OUT)</span>}
                          {txn.transaction_type === "ADJUST" && <span className="px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-lg">ปรับปรุง (ADJ)</span>}
                        </td>
                        <td className={`p-3 text-center font-black ${txn.transaction_type === "IN" ? "text-green-600" : "text-red-500"}`}>
                          {txn.transaction_type === "IN" ? "+" : "-"}{txn.quantity}
                        </td>
                        <td className="p-3 text-center font-black text-blue-600">{txn.balance_after}</td>
                        <td className="p-3 text-[10px] text-gray-600 space-y-0.5">
                          <div><span className="font-bold">อ้างอิง:</span> {txn.reference_doc}</div>
                          {txn.suppliers?.name && <div><span className="font-bold text-green-700">ผู้จำหน่าย:</span> {txn.suppliers.name}</div>}
                          {txn.inventory_lots?.lot_number && <div><span className="font-bold text-orange-600">Lot:</span> {txn.inventory_lots.lot_number}</div>}
                          {txn.notes && <div className="italic text-gray-400">หมายเหตุ: {txn.notes}</div>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}