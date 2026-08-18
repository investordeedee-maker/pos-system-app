"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabase";

interface Product {
  id: string;
  name: string;
  price: number; 
  sell_price: number;
  stock_qty: number;
  is_vat_exempt: boolean;
  image_url: string;
}

interface CartItem extends Product {
  cart_qty: number;
  remark?: string; // เพิ่มฟิลด์หมายเหตุ
}

interface StoreSettings {
  id: string;
  name: string;
  address: string;
  logo_url: string;
  promptpay_number: string;
  phone_number: string;
  receipt_title: string;
  invoice_title: string;
  tax_id: string;
  receipt_footer: string;
}

interface ReceiptData {
  docNo: string;
  items: CartItem[];
  totalAmount: number;
  totalExempt: number;
  totalVatable: number;
  vatAmount: number;
  paymentMethod: string;
  cashReceived: number | "";
  changeAmount: number;
  date: Date;
}

interface PendingOrderItem {
  product_id: string;
  unit_price: number;
  qty: number;
  remark?: string; // เพิ่มฟิลด์หมายเหตุ
  products?: {
    name: string;
    is_vat_exempt: boolean;
  };
}

interface PendingOrder {
  id: string;
  doc_no: string;
  created_at: string;
  total_amount: number;
  order_items: PendingOrderItem[];
}

function generatePromptPayPayload(mobileOrId: string, amount: number): string {
  const cleanId = mobileOrId.replace(/[^0-9]/g, "");
  let targetField = "";
  
  if (cleanId.length === 10) {
    const formattedMobile = "0066" + cleanId.substring(1);
    targetField = "0066" + formattedMobile.length.toString().padStart(2, "0") + formattedMobile;
  } else if (cleanId.length === 13) {
    targetField = "0213" + cleanId;
  } else {
    return "";
  }

  const merchantAccountInfo = "0016A000000677010111" + targetField;
  const tag29 = "29" + merchantAccountInfo.length.toString().padStart(2, "0") + merchantAccountInfo;
  const asciiAmount = amount.toFixed(2);

  const payloadWithoutCrc = 
    "000201" +
    "010211" +
    tag29 +
    "5802TH" +
    "5303764" +
    "54" + asciiAmount.length.toString().padStart(2, "0") + asciiAmount +
    "6304";

  let crc = 0xFFFF;
  for (let i = 0; i < payloadWithoutCrc.length; i++) {
    crc ^= payloadWithoutCrc.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  const hexCrc = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
  return payloadWithoutCrc + hexCrc;
}

export default function POSPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [cashReceived, setCashReceived] = useState<number | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [selectedPendingOrder, setSelectedPendingOrder] = useState<PendingOrder | null>(null);

  useEffect(() => {
    let isMounted = true;
    const initPOS = async () => {
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
          const { data: storeData } = await supabase
            .from("stores")
            .select("*")
            .eq("id", profile.store_id)
            .single();
            
          if (storeData) setStoreSettings(storeData);
          
          const { data: productsData } = await supabase
            .from("products")
            .select("*")
            .eq("store_id", profile.store_id)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false });

          if (productsData) {
            const mappedProducts = productsData.map(p => ({
              ...p,
              price: p.sell_price 
            }));
            setProducts(mappedProducts);
          }
        }
      } catch (error) {
        console.error("Error loading POS:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initPOS();
    return () => { isMounted = false; };
  }, [router]);

  const addToCart = (product: Product) => {
    if (product.stock_qty <= 0) {
      alert("สินค้าหมดสต๊อก!");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.cart_qty >= product.stock_qty) {
          alert("ไม่สามารถเพิ่มสินค้าเกินจำนวนในคลังได้");
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, cart_qty: item.cart_qty + 1 } : item
        );
      }
      return [...prev, { ...product, cart_qty: 1, remark: "" }]; // เริ่มต้นด้วยหมายเหตุว่างๆ
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  // ฟังก์ชันสำหรับอัปเดตหมายเหตุของสินค้าแต่ละชิ้นในตะกร้า
  const updateRemark = (id: string, remark: string) => {
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, remark } : item));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.cart_qty, 0);
  const totalExempt = cart.filter(item => item.is_vat_exempt).reduce((sum, item) => sum + item.price * item.cart_qty, 0);
  const grossVatable = totalAmount - totalExempt;
  const totalVatable = grossVatable / 1.07;
  const vatAmount = grossVatable - totalVatable;
  const changeAmount = paymentMethod === "cash" && typeof cashReceived === "number" ? cashReceived - totalAmount : 0;

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const loadPendingOrders = async () => {
    if (!storeSettings?.id) return;
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`*, order_items(*, products(*))`)
        .eq("store_id", storeSettings.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingOrders(data || []);
      setShowPendingModal(true);
    } catch (error: unknown) {
      console.error("Error fetching pending orders:", error);
      if (error instanceof Error) {
        alert("เกิดข้อผิดพลาดในการดึงบิลค้างชำระ: " + error.message);
      }
    }
  };

  const handleSavePendingOrder = async () => {
    if (!storeSettings?.id || cart.length === 0) return;
    setIsProcessing(true);

    try {
      const now = new Date();
      const prefix = `IV${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-`;

      const { data: lastOrder } = await supabase
        .from("orders")
        .select("doc_no")
        .eq("store_id", storeSettings.id)
        .like("doc_no", `${prefix}%`)
        .order("doc_no", { ascending: false })
        .limit(1);

      let runningNum = 1;
      if (lastOrder && lastOrder.length > 0 && lastOrder[0].doc_no) {
        runningNum = parseInt(lastOrder[0].doc_no.split("-")[1], 10) + 1;
      }
      const docNo = `${prefix}${runningNum.toString().padStart(4, '0')}`;

      const { data: orderData, error: orderError } = await supabase.from("orders").insert([{
        store_id: storeSettings.id,
        doc_no: docNo,
        order_source: "POS",
        status: "pending", 
        total_amount: totalAmount,
        payment_method: "cash", 
      }]).select().single();

      if (orderError) throw orderError;

      const orderItemsToInsert = cart.map((item) => ({
        order_id: orderData.id,
        product_id: item.id,
        qty: item.cart_qty,
        unit_price: item.price,
        remark: item.remark || "", // บันทึกหมายเหตุลง DB
      }));
      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsToInsert);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        await supabase.from("products").update({ stock_qty: item.stock_qty - item.cart_qty }).eq("id", item.id);
      }
      
      setProducts(prev => prev.map(p => {
        const soldItem = cart.find(c => c.id === p.id);
        return soldItem ? { ...p, stock_qty: p.stock_qty - soldItem.cart_qty } : p;
      }));

      alert(`✅ บันทึกใบแจ้งหนี้เลขที่ ${docNo} สำเร็จ (รอเก็บเงินหน้างาน)`);
      setCart([]);
      setShowCheckout(false);

    } catch (error: unknown) {
      if (error instanceof Error) alert("เกิดข้อผิดพลาดในการบันทึกบิลค้าง: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!storeSettings?.id || cart.length === 0) return;
    if (paymentMethod === "cash" && (typeof cashReceived !== "number" || cashReceived < totalAmount)) {
      alert("กรุณาระบุจำนวนเงินรับให้ครบถ้วน");
      return;
    }

    setIsProcessing(true);

    try {
      const now = new Date();
      const yy = now.getFullYear().toString().slice(-2);
      const mm = (now.getMonth() + 1).toString().padStart(2, '0');
      const dd = now.getDate().toString().padStart(2, '0');
      const prefix = `IV${yy}${mm}${dd}-`;

      const { data: lastOrder } = await supabase
        .from("orders")
        .select("doc_no")
        .eq("store_id", storeSettings.id)
        .like("doc_no", `${prefix}%`)
        .order("doc_no", { ascending: false })
        .limit(1);

      let runningNum = 1;
      if (lastOrder && lastOrder.length > 0 && lastOrder[0].doc_no) {
        const lastNumStr = lastOrder[0].doc_no.split("-")[1];
        if (lastNumStr && !isNaN(Number(lastNumStr))) {
          runningNum = parseInt(lastNumStr, 10) + 1;
        }
      }

      const docNo = `${prefix}${runningNum.toString().padStart(4, '0')}`;

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert([{
          store_id: storeSettings.id,
          doc_no: docNo,
          order_source: "POS",
          status: "completed",
          total_amount: totalAmount,
          payment_method: paymentMethod,
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItemsToInsert = cart.map((item) => ({
        order_id: orderData.id,
        product_id: item.id,
        qty: item.cart_qty,
        unit_price: item.price,
        remark: item.remark || "", // บันทึกหมายเหตุลง DB
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsToInsert);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const newStock = item.stock_qty - item.cart_qty;
        await supabase
          .from("products")
          .update({ stock_qty: newStock })
          .eq("id", item.id);
      }
      
      setProducts(prev => prev.map(p => {
        const soldItem = cart.find(c => c.id === p.id);
        return soldItem ? { ...p, stock_qty: p.stock_qty - soldItem.cart_qty } : p;
      }));
      
      setReceiptData({
        docNo,
        items: cart,
        totalAmount,
        totalExempt,
        totalVatable,
        vatAmount,
        paymentMethod,
        cashReceived,
        changeAmount,
        date: now
      });

      setCart([]);
      setShowCheckout(false);
      setCashReceived("");

    } catch (error: unknown) {
      if (error instanceof Error) {
        alert("เกิดข้อผิดพลาดในการบันทึก: " + error.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayPendingOrder = async () => {
    if (!selectedPendingOrder) return;
    
    const orderTotal = selectedPendingOrder.total_amount;
    if (paymentMethod === "cash" && (typeof cashReceived !== "number" || cashReceived < orderTotal)) {
        alert("กรุณาระบุจำนวนเงินรับให้ครบถ้วน");
        return;
    }

    setIsProcessing(true);
    try {
        const { error } = await supabase
            .from("orders")
            .update({ status: "completed", payment_method: paymentMethod })
            .eq("id", selectedPendingOrder.id);
        
        if (error) throw error;

        const mappedItems: CartItem[] = selectedPendingOrder.order_items.map((oi: PendingOrderItem) => ({
            id: oi.product_id,
            name: oi.products?.name || "สินค้า",
            price: oi.unit_price,
            cart_qty: oi.qty,
            is_vat_exempt: oi.products?.is_vat_exempt || false,
            remark: oi.remark || "",
            stock_qty: 0, sell_price: 0, image_url: ""
        }));

        const tExempt = mappedItems.filter(item => item.is_vat_exempt).reduce((sum, item) => sum + item.price * item.cart_qty, 0);
        const gVatable = orderTotal - tExempt;
        const tVatable = gVatable / 1.07;
        const vAmount = gVatable - tVatable;
        const cAmount = paymentMethod === "cash" && typeof cashReceived === "number" ? cashReceived - orderTotal : 0;

        setReceiptData({
            docNo: selectedPendingOrder.doc_no,
            items: mappedItems,
            totalAmount: orderTotal,
            totalExempt: tExempt,
            totalVatable: tVatable,
            vatAmount: vAmount,
            paymentMethod,
            cashReceived,
            changeAmount: cAmount,
            date: new Date()
        });

        setSelectedPendingOrder(null);
        setShowPendingModal(false);
        setCashReceived("");
        
    } catch (error: unknown) {
        if (error instanceof Error) alert("เกิดข้อผิดพลาดในการอัปเดตบิล: " + error.message);
    } finally {
        setIsProcessing(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดระบบ POS...</div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        #invoice-print-area { display: none; }
        #receipt-print-area { display: none; }
        @media print {
          @page { margin: 0; size: 58mm auto; }
          html, body { height: max-content !important; overflow: hidden !important; background: white; margin: 0; padding: 0; }
          body * { visibility: hidden; }
          
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          
          #invoice-print-area, #receipt-print-area {
            display: block !important;
            position: absolute;
            left: 0; top: 0;
            width: 58mm;
            padding: 2mm;
            margin: 0;
            color: #000;
            font-family: 'Courier New', Courier, monospace;
          }
          img { display: block !important; max-width: 50px !important; height: auto !important; object-fit: contain; margin: 0 auto; }
          svg { display: block !important; margin: 0 auto; }
          .no-print { display: none !important; }
        }
      `}} />

      <div className="flex h-screen bg-gray-100 font-sans relative no-print">
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          <div className="mb-4 flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm gap-4">
            <h1 className="text-2xl font-bold text-gray-800">POS</h1>
            <div className="flex w-full md:w-auto gap-3">
              <input
                type="text"
                placeholder="ค้นหาชื่อสินค้า..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg w-full md:w-64 outline-none bg-gray-50"
              />
              <button onClick={loadPendingOrders} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-3 rounded-lg font-bold shadow-sm whitespace-nowrap">🧾 บิลค้างชำระ</button>
              <button onClick={() => router.push("/settings")} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-3 rounded-lg font-bold shadow-sm whitespace-nowrap">ตั้งค่า</button>
              <button onClick={() => router.push("/products")} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-3 rounded-lg font-bold shadow-md whitespace-nowrap">คลังสินค้า</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            {products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <p className="font-medium text-lg">ยังไม่มีสินค้าในร้าน</p>
                <button onClick={() => router.push("/products")} className="mt-4 text-blue-600 hover:underline font-bold">ไปเพิ่มสินค้าที่คลังเลย</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`bg-white p-4 rounded-2xl shadow-sm border ${product.stock_qty <= 0 ? 'border-red-200 opacity-60' : 'border-gray-100 hover:border-blue-400 cursor-pointer'} transition-all flex flex-col h-56`}
                  >
                    <div className="flex-1 flex items-center justify-center bg-white rounded-xl mb-3 overflow-hidden relative border border-gray-50">
                      {product.image_url ? (
                        <Image src={product.image_url} alt={product.name} fill className="object-contain p-2" unoptimized />
                      ) : (
                        <span className="text-gray-400 text-sm">ไม่มีรูป</span>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-800 text-sm truncate">{product.name}</h3>
                    <div className="flex justify-between items-end mt-1">
                      <span className="text-blue-600 font-black text-lg">{product.price.toFixed(2)} ฿</span>
                      <span className="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-600">คลัง: {product.stock_qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full md:w-96 bg-white shadow-2xl flex flex-col z-10 border-l border-gray-200">
          <div className="p-5 bg-gray-900 text-white flex justify-between items-center">
            <h2 className="text-lg font-bold">ตะกร้าสินค้า</h2>
            <button onClick={() => setCart([])} className="text-sm font-medium text-red-400 bg-red-400/10 px-3 py-1 rounded-md">ล้างทั้งหมด</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 font-medium">ยังไม่มีสินค้าในตะกร้า</div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex flex-col bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex-1 pr-2">
                      <h4 className="text-sm font-bold text-gray-800 truncate">{item.name}</h4>
                      <div className="text-xs text-gray-500 mt-1">{item.price.toFixed(2)} ฿</div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-black text-blue-600">{item.cart_qty}</span>
                      <span className="font-black text-sm w-16 text-right">{(item.price * item.cart_qty).toFixed(2)}</span>
                      <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 font-bold">✕</button>
                    </div>
                  </div>
                  {/* ฟิลด์กรอกหมายเหตุ */}
                  <input
                    type="text"
                    placeholder="หมายเหตุ (เช่น เพิ่มสี, ขนาดพิเศษ)..."
                    value={item.remark || ""}
                    onChange={(e) => updateRemark(item.id, e.target.value)}
                    className="w-full text-xs px-2 py-1 border border-gray-200 rounded outline-none bg-gray-50 focus:bg-white focus:border-blue-300 transition-all"
                  />
                </div>
              ))
            )}
          </div>

          <div className="p-6 bg-white border-t border-gray-100">
            <div className="flex justify-between items-end mb-4">
              <span className="text-gray-500 font-bold">ยอดชำระสุทธิ</span>
              <span className="text-4xl font-black text-blue-600">{totalAmount.toFixed(2)} <span className="text-xl">฿</span></span>
            </div>
            <button onClick={() => setShowCheckout(true)} disabled={cart.length === 0} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl shadow-lg text-lg">
              ออกใบแจ้งหนี้ / ชำระเงิน
            </button>
          </div>
        </div>
      </div>

      {/* --- หน้าต่าง: รายการบิลค้างชำระ --- */}
      {showPendingModal && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40 p-4 no-print">
             <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                 <div className="p-5 bg-orange-500 text-white flex justify-between items-center">
                    <h2 className="text-xl font-bold">🧾 รายการบิลค้างชำระ</h2>
                    <button onClick={() => { setShowPendingModal(false); setSelectedPendingOrder(null); }} className="text-white font-bold text-xl">✕</button>
                 </div>
                 
                 <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                    {!selectedPendingOrder ? (
                        <>
                            {pendingOrders.length === 0 ? (
                                <p className="text-center text-gray-500 mt-10">ไม่มีบิลค้างชำระในระบบ</p>
                            ) : (
                                <div className="space-y-3">
                                    {pendingOrders.map(order => (
                                        <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800">{order.doc_no}</p>
                                                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="font-black text-blue-600 text-lg">{order.total_amount.toFixed(2)} ฿</span>
                                                <button onClick={() => setSelectedPendingOrder(order)} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg font-bold">รับเงิน</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="animate-fade-in">
                            <button onClick={() => setSelectedPendingOrder(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-4 font-bold">← ย้อนกลับไปหน้ารายการ</button>
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6 text-center">
                                <p className="text-gray-500 text-sm">เลขที่บิล: {selectedPendingOrder.doc_no}</p>
                                <h3 className="text-3xl font-black text-blue-600 mt-2">{selectedPendingOrder.total_amount.toFixed(2)} ฿</h3>
                            </div>
                            
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                                <label className="block text-sm font-bold text-gray-700 mb-3">เลือกวิธีชำระเงิน (หน้างาน)</label>
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                <button onClick={() => setPaymentMethod("cash")} className={`py-3 rounded-xl font-bold border-2 ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>เงินสด</button>
                                <button onClick={() => setPaymentMethod("transfer")} className={`py-3 rounded-xl font-bold border-2 ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>โอนเงิน / QR</button>
                                </div>

                                {paymentMethod === "transfer" && storeSettings?.promptpay_number && (
                                <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100 flex flex-col items-center">
                                    <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, selectedPendingOrder.total_amount)} size={160} />
                                    <p className="font-bold text-blue-800 mt-3">ให้ลูกค้าสแกน QR Code เพื่อโอนเงิน</p>
                                </div>
                                )}

                                {paymentMethod === "cash" && (
                                <div className="mt-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">รับเงินสดมา</label>
                                    <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value ? Number(e.target.value) : "")} className="w-full px-4 py-3 text-lg font-bold border-2 border-gray-300 rounded-xl outline-none" placeholder="0.00" />
                                </div>
                                )}
                            </div>
                        </div>
                    )}
                 </div>
                 
                 {selectedPendingOrder && (
                    <div className="p-5 bg-white border-t">
                        <button onClick={handlePayPendingOrder} disabled={isProcessing} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg">
                            {isProcessing ? "กำลังบันทึก..." : "✅ ยืนยันรับเงิน และออกใบเสร็จ"}
                        </button>
                    </div>
                 )}
             </div>
          </div>
      )}

      {/* --- หน้าต่างใบแจ้งหนี้ (ก่อนชำระเงิน) --- */}
      {showCheckout && storeSettings && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-30 p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-blue-600 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold">{storeSettings.invoice_title || "ใบแจ้งหนี้"}</h2>
              <button onClick={() => setShowCheckout(false)} className="text-white font-bold text-xl">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
              <div className="text-center mb-6">
                {storeSettings.logo_url && (
                  <div className="w-16 h-16 relative mx-auto mb-2 bg-white rounded-lg shadow-sm border p-1">
                    <Image src={storeSettings.logo_url} alt="Logo" fill className="object-contain" unoptimized />
                  </div>
                )}
                <h3 className="text-2xl font-black text-gray-800">{storeSettings.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{storeSettings.address}</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-6">
                <div className="space-y-2 mb-4 pb-4 border-b border-dashed border-gray-300">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex flex-col text-sm text-gray-700 mb-2">
                      <div className="flex justify-between">
                        <span>{item.cart_qty} x {item.name} {item.is_vat_exempt && "(V0)"}</span>
                        <span className="font-bold">{(item.price * item.cart_qty).toFixed(2)} ฿</span>
                      </div>
                      {item.remark && <span className="text-xs text-gray-400 italic mt-1">- {item.remark}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-2xl font-black text-blue-600">
                  <span>ยอดที่ต้องชำระ</span>
                  <span>{totalAmount.toFixed(2)} ฿</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                <label className="block text-sm font-bold text-gray-700 mb-3">เลือกวิธีชำระเงิน</label>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button onClick={() => setPaymentMethod("cash")} className={`py-3 rounded-xl font-bold border-2 ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>เงินสด</button>
                  <button onClick={() => setPaymentMethod("transfer")} className={`py-3 rounded-xl font-bold border-2 ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>โอนเงิน / QR</button>
                </div>

                {paymentMethod === "transfer" && (
                  <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100 flex flex-col items-center">
                    <p className="font-bold text-blue-800 mb-3">สแกน QR Code พร้อมเพย์</p>
                    {storeSettings.promptpay_number ? (
                      <div className="bg-white p-3 rounded-xl shadow-sm border">
                        <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={160} />
                      </div>
                    ) : (
                      <p className="text-red-500 font-bold text-sm">กรุณาไปตั้งค่าเบอร์ PromptPay ในหน้า ตั้งค่าระบบ ก่อน</p>
                    )}
                  </div>
                )}

                {paymentMethod === "cash" && (
                  <div className="mt-4">
                    <label className="block text-sm font-bold text-gray-700 mb-2">รับเงินสดมา</label>
                    <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value ? Number(e.target.value) : "")} className="w-full px-4 py-3 text-lg font-bold border-2 border-gray-300 rounded-xl outline-none" placeholder="0.00" />
                    {changeAmount > 0 && (
                      <div className="mt-3 flex justify-between items-center text-lg bg-green-50 text-green-700 p-4 rounded-xl font-black">
                        <span>เงินทอน</span>
                        <span>{changeAmount.toFixed(2)} ฿</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 bg-white border-t flex flex-col gap-3">
              <div className="flex gap-3">
                <button onClick={() => window.print()} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-4 py-4 rounded-xl transition-all flex-1">🖨️ พิมพ์ใบแจ้งหนี้</button>
                <button onClick={handleSavePendingOrder} disabled={isProcessing} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-4 rounded-xl transition-all flex-1 shadow-md">
                  💾 บันทึกค้างชำระ
                </button>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCheckout(false)} className="flex-1 bg-white border-2 border-gray-200 text-gray-600 rounded-xl font-bold py-4">ยกเลิก</button>
                <button onClick={handleConfirmPayment} disabled={isProcessing} className="flex-[2] py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg">
                  {isProcessing ? "กำลังบันทึก..." : "ยืนยันรับเงิน / ออกใบเสร็จ"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- โครงสร้างสำหรับพิมพ์ใบแจ้งหนี้ --- */}
      {showCheckout && storeSettings && (
        <div id="invoice-print-area">
          <div className="text-center mb-2">
            {storeSettings.logo_url && (
              <div className="flex justify-center mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={storeSettings.logo_url} alt="Logo" crossOrigin="anonymous" style={{ maxWidth: '50px', height: 'auto', objectFit: 'contain' }} />
              </div>
            )}
            <h1 className="font-bold" style={{ fontSize: '14px' }}>{storeSettings.name}</h1>
            <p style={{ fontSize: '9px' }}>{storeSettings.address}</p>
            {storeSettings.phone_number && <p style={{ fontSize: '9px' }}>โทร: {storeSettings.phone_number}</p>}
            <p className="mt-1 font-bold border-y border-dashed border-gray-400 py-1" style={{ fontSize: '11px' }}>
              {storeSettings.invoice_title || "ใบแจ้งหนี้"}
            </p>
          </div>
          <div className="space-y-1 mb-2 border-b border-dashed border-gray-400 pb-2" style={{ fontSize: '10px' }}>
            {cart.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start mb-1">
                <div className="flex-1 pr-1">
                  <p className="font-bold">{item.name} {item.is_vat_exempt && "(V0)"}</p>
                  {item.remark && <p style={{ fontSize: '8px', fontStyle: 'italic', color: '#555' }}>- {item.remark}</p>}
                  <p style={{ fontSize: '9px' }}>{item.cart_qty} x {item.price.toFixed(2)}</p>
                </div>
                <div className="font-bold">{(item.price * item.cart_qty).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between font-black mb-2" style={{ fontSize: '12px' }}>
            <span>ยอดที่ต้องชำระ</span>
            <span>{totalAmount.toFixed(2)} ฿</span>
          </div>
          {storeSettings.promptpay_number && (
            <div className="text-center my-2">
              <div className="flex justify-center">
                <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={110} />
              </div>
              <p style={{ fontSize: '8px' }} className="mt-1">สแกนชำระผ่าน QR Code พร้อมเพย์</p>
            </div>
          )}
          <div className="text-center mt-2" style={{ fontSize: '9px' }}>
            <p>กรุณาชำระเงินตามยอดดังกล่าว</p>
          </div>
        </div>
      )}

      {/* --- หน้าต่างพรีวิวใบเสร็จรับเงิน (บนหน้าจอ) --- */}
      {receiptData && storeSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative">
            
            <div className="p-4 bg-green-50 border-b flex justify-between items-center">
              <h2 className="font-bold text-green-800">ชำระเงินสำเร็จ</h2>
              <button onClick={() => setReceiptData(null)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>

            <div className="p-6 bg-white overflow-y-auto max-h-[60vh]">
              <div className="text-center mb-4">
                {storeSettings.logo_url && (
                  <div className="flex justify-center mb-2">
                    <Image src={storeSettings.logo_url} alt="Logo" width={48} height={48} className="object-contain" unoptimized />
                  </div>
                )}
                <h1 className="font-bold text-sm">{storeSettings.name}</h1>
                <p className="text-gray-600 text-xs">{storeSettings.address}</p>
                {storeSettings.phone_number && <p className="text-gray-600 text-xs">โทร: {storeSettings.phone_number}</p>}
                {storeSettings.tax_id && <p className="text-xs">TAX ID: {storeSettings.tax_id}</p>}
                
                <p className="mt-2 font-bold border-y border-dashed border-gray-300 py-1 text-xs">
                  {storeSettings.receipt_title || "ใบเสร็จรับเงิน"}
                </p>
              </div>
              
              <div className="flex justify-between mb-2 text-xs">
                <div>
                  <p>เลขที่: <span className="font-bold">{receiptData.docNo}</span></p>
                  <p>วันที่: {receiptData.date.toLocaleString('th-TH')}</p>
                </div>
              </div>

              <div className="space-y-1 mb-2 border-b border-dashed border-gray-300 pb-2 text-xs">
                {receiptData.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col mb-2">
                    <div className="flex justify-between">
                      <div className="flex-1 pr-2">
                        <p className="font-bold">{item.name} {item.is_vat_exempt && <span className="text-[10px]">(V0)</span>}</p>
                        <p className="text-[10px] text-gray-500">{item.cart_qty} x {item.price.toFixed(2)}</p>
                      </div>
                      <div className="text-right font-bold pt-1">
                        {(item.price * item.cart_qty).toFixed(2)}
                      </div>
                    </div>
                    {item.remark && <span className="text-[10px] text-gray-400 italic mt-1">- {item.remark}</span>}
                  </div>
                ))}
              </div>

              <div className="space-y-1 mb-2 border-b border-dashed border-gray-300 pb-2 text-xs">
                <div className="flex justify-between">
                  <span>มูลค่ายกเว้นภาษี (VAT 0%)</span>
                  <span>{receiptData.totalExempt.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>มูลค่าสินค้าก่อน VAT</span>
                  <span>{receiptData.totalVatable.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
                  <span>{receiptData.vatAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black mt-1 text-sm">
                  <span>ยอดสุทธิ</span>
                  <span>{receiptData.totalAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-1 mb-6 text-xs">
                <div className="flex justify-between">
                  <span>รับเงิน ({receiptData.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน'})</span>
                  <span>{receiptData.paymentMethod === 'cash' ? Number(receiptData.cashReceived).toFixed(2) : receiptData.totalAmount.toFixed(2)}</span>
                </div>
                {receiptData.changeAmount > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>เงินทอน</span>
                    <span>{receiptData.changeAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="text-center text-gray-500 text-[10px]">
                <p>{storeSettings.receipt_footer || "ขอขอบคุณที่มาอุดหนุนและใช้บริการ"}</p>
                <p>Powered by POS System</p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t flex gap-3">
              <button onClick={() => setReceiptData(null)} className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-3 rounded-xl">ปิด</button>
              <button onClick={() => window.print()} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md">พิมพ์สลิป (58mm)</button>
            </div>
          </div>
        </div>
      )}

      {/* --- โครงสร้างสำหรับพิมพ์ใบเสร็จ --- */}
      {receiptData && storeSettings && (
        <div id="receipt-print-area">
          <div className="text-center mb-2">
            {storeSettings.logo_url && (
              <div className="flex justify-center mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={storeSettings.logo_url} alt="Logo" crossOrigin="anonymous" style={{ maxWidth: '50px', height: 'auto', objectFit: 'contain' }} />
              </div>
            )}
            <h1 className="font-bold" style={{ fontSize: '14px' }}>{storeSettings.name}</h1>
            <p style={{ fontSize: '9px' }}>{storeSettings.address}</p>
            {storeSettings.phone_number && <p style={{ fontSize: '9px' }}>โทร: {storeSettings.phone_number}</p>}
            {storeSettings.tax_id && <p style={{ fontSize: '9px' }}>TAX ID: {storeSettings.tax_id}</p>}
            <p className="mt-1 font-bold border-y border-dashed border-gray-400 py-1" style={{ fontSize: '11px' }}>
              {storeSettings.receipt_title || "ใบเสร็จรับเงิน"}
            </p>
          </div>

          <div className="flex justify-between mb-1" style={{ fontSize: '9px' }}>
            <div>
              <p>เลขที่: <span className="font-bold">{receiptData.docNo}</span></p>
              <p>วันที่: {receiptData.date.toLocaleString('th-TH')}</p>
            </div>
          </div>

          <div className="space-y-1 mb-2 border-b border-dashed border-gray-400 pb-2" style={{ fontSize: '10px' }}>
            {receiptData.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start mb-1">
                <div className="flex-1 pr-1">
                  <p className="font-bold">{item.name} {item.is_vat_exempt && <span style={{ fontSize: '8px' }}>(V0)</span>}</p>
                  {item.remark && <p style={{ fontSize: '8px', fontStyle: 'italic', color: '#555' }}>- {item.remark}</p>}
                  <p style={{ fontSize: '8px' }}>{item.cart_qty} x {item.price.toFixed(2)}</p>
                </div>
                <div className="text-right font-bold pt-1">
                  {(item.price * item.cart_qty).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1 mb-2 border-b border-dashed border-gray-400 pb-2" style={{ fontSize: '9px' }}>
            <div className="flex justify-between">
              <span>มูลค่ายกเว้นภาษี (VAT 0%)</span>
              <span>{receiptData.totalExempt.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>มูลค่าสินค้าก่อน VAT</span>
              <span>{receiptData.totalVatable.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
              <span>{receiptData.vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black mt-1" style={{ fontSize: '12px' }}>
              <span>ยอดสุทธิ</span>
              <span>{receiptData.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-1 mb-4" style={{ fontSize: '9px' }}>
            <div className="flex justify-between">
              <span>รับเงิน ({receiptData.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน'})</span>
              <span>{receiptData.paymentMethod === 'cash' ? Number(receiptData.cashReceived).toFixed(2) : receiptData.totalAmount.toFixed(2)}</span>
            </div>
            {receiptData.changeAmount > 0 && (
              <div className="flex justify-between font-bold">
                <span>เงินทอน</span>
                <span>{receiptData.changeAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="text-center text-gray-600" style={{ fontSize: '8px' }}>
            <p>{storeSettings.receipt_footer || "ขอขอบคุณที่มาอุดหนุนและใช้บริการ"}</p>
            <p>Powered by POS System</p>
          </div>
        </div>
      )}
    </>
  );
}