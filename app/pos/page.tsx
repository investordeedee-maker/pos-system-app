"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
// แก้ไขจุดนี้: ถอยกลับ 2 ชั้นเพื่อให้ตรงกับโครงสร้างโฟลเดอร์จริงของคุณ
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
  remark?: string;
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
  remark?: string;
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
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

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
            const mappedProducts = productsData.map((p: Product) => ({
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
      return [...prev, { ...product, cart_qty: 1, remark: "" }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const decreaseQuantity = (productId: string) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === productId);
      if (existing?.cart_qty === 1) return prevCart.filter((item) => item.id !== productId);
      return prevCart.map((item) => item.id === productId ? { ...item, cart_qty: item.cart_qty - 1 } : item);
    });
  };

  const updateRemark = (id: string, remark: string) => {
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, remark } : item));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.cart_qty, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.cart_qty, 0);
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
        remark: item.remark || "",
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
      setIsMobileCartOpen(false);

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
        remark: item.remark || "",
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
      setIsMobileCartOpen(false);
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
      <style dangerouslySetInnerHTML={{
        __html: `
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

      <div className="flex flex-col h-screen bg-gray-100 font-sans relative no-print pb-24 md:pb-0">
        
        {/* Header แถบบนสุด */}
        <header className="bg-white shadow-sm px-4 py-3 flex flex-wrap items-center justify-between z-10 sticky top-0">
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              {storeSettings?.logo_url ? (
                <div className="w-10 h-10 relative rounded-md overflow-hidden bg-white border border-gray-100">
                  <Image src={storeSettings.logo_url} alt="Logo" fill className="object-contain p-1" unoptimized />
                </div>
              ) : (
                <div className="w-10 h-10 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-lg">{storeSettings?.name ? storeSettings.name.charAt(0) : "S"}</div>
              )}
              <h1 className="text-xl font-black text-gray-800 tracking-tight hidden sm:block">{storeSettings?.name || "Standard POS"}</h1>
            </div>
            <button onClick={() => router.push("/")} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs md:text-sm border border-gray-200 shadow-sm transition-all active:scale-95">
              🏠 หน้าหลัก
            </button>
          </div>
          
          <div className="flex w-full md:w-auto gap-2 mt-3 md:mt-0 overflow-x-auto pb-1 md:pb-0">
            <input
              type="text"
              placeholder="ค้นหาสินค้า..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg w-full md:w-48 outline-none bg-gray-50 text-sm focus:border-blue-400 focus:bg-white transition-all flex-shrink-0"
            />
            <button onClick={loadPendingOrders} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-2 rounded-lg font-bold shadow-sm whitespace-nowrap text-sm flex-shrink-0">🧾 บิลค้าง</button>
            <button onClick={() => router.push("/products")} className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-lg font-bold shadow-md whitespace-nowrap text-sm flex-shrink-0">📦 คลัง</button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* พื้นที่แคตตาล็อกสินค้า */}
          <div className="flex-1 flex flex-col p-4 overflow-y-auto">
            {products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <p className="font-medium text-lg">ยังไม่มีสินค้าในร้าน</p>
                <button onClick={() => router.push("/products")} className="mt-4 text-blue-600 hover:underline font-bold">ไปเพิ่มสินค้าที่คลังเลย</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-10">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`bg-white p-3 rounded-2xl shadow-sm border ${product.stock_qty <= 0 ? 'border-red-200 opacity-60' : 'border-gray-100 hover:border-blue-400 cursor-pointer hover:shadow-md'} transition-all flex flex-col active:scale-95`}
                  >
                    <div className="w-full aspect-square bg-gray-50 rounded-xl mb-2 flex items-center justify-center relative overflow-hidden border border-gray-100 p-1">
                      {product.image_url ? (
                        <Image src={product.image_url} alt={product.name} fill className="object-cover rounded-lg" unoptimized />
                      ) : (
                        <span className="text-gray-400 text-xs font-medium">ไม่มีรูป</span>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-800 text-sm line-clamp-2 h-10 mt-1">{product.name}</h3>
                    <div className="flex justify-between items-end mt-2">
                      <span className="text-blue-600 font-black text-base md:text-lg">฿{product.price.toLocaleString()}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">คลัง: {product.stock_qty}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ตะกร้าสินค้าด้านขวา (ซ่อนบนมือถือ) */}
          <div className={`${isMobileCartOpen ? "fixed inset-0 z-50 flex" : "hidden"} md:flex w-full md:w-[350px] lg:w-[400px] flex-col bg-gray-900/50 md:bg-white md:shadow-2xl md:border-l border-gray-200`}>
            <div className="bg-white w-full h-full md:h-auto flex flex-col mt-auto md:mt-0 rounded-t-3xl md:rounded-none overflow-hidden">
              <div className="p-4 bg-gray-900 text-white flex justify-between items-center rounded-t-3xl md:rounded-none">
                <h2 className="text-base font-bold flex items-center gap-2">🛒 ตะกร้าสินค้า <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs">{totalItems}</span></h2>
                <div className="flex gap-3">
                  <button onClick={() => setCart([])} className="text-xs font-medium text-red-400 bg-red-400/10 px-2 py-1 rounded">ล้างทั้งหมด</button>
                  <button className="md:hidden text-white font-bold px-2" onClick={() => setIsMobileCartOpen(false)}>✕</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/50">
                {cart.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm font-medium border-2 border-dashed border-gray-200 rounded-xl bg-white">ยังไม่ได้เลือกสินค้า</div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex flex-col bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 pr-2">
                          <h4 className="text-sm font-bold text-gray-800 line-clamp-1">{item.name}</h4>
                          <div className="text-xs font-bold text-blue-600 mt-0.5">฿{item.price.toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-50 px-1 py-1 rounded-lg border border-gray-100">
                          <button onClick={() => decreaseQuantity(item.id)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm font-bold text-gray-600 active:scale-90">-</button>
                          <span className="font-bold text-sm w-4 text-center text-gray-800">{item.cart_qty}</span>
                          <button onClick={() => addToCart(item)} className="w-6 h-6 flex items-center justify-center bg-blue-600 rounded text-white shadow-sm font-bold active:scale-90">+</button>
                          <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 flex items-center justify-center bg-red-100 rounded text-red-500 shadow-sm font-bold active:scale-90 ml-1">✕</button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="หมายเหตุ: (เช่น หวานน้อย, ไม่เอาน้ำแข็ง)..."
                        value={item.remark || ""}
                        onChange={(e) => updateRemark(item.id, e.target.value)}
                        className="w-full text-xs px-3 py-1.5 border border-gray-200 rounded-md outline-none bg-gray-50 focus:bg-white focus:border-blue-300 transition-all placeholder-gray-400"
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 bg-white border-t border-gray-100 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-gray-500 font-bold text-sm">ยอดชำระสุทธิ</span>
                  <span className="text-3xl font-black text-blue-600">฿{totalAmount.toLocaleString()}</span>
                </div>
                <button 
                  onClick={() => setShowCheckout(true)} 
                  disabled={cart.length === 0} 
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${cart.length > 0 ? "bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-blue-200" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                >
                  ออกใบแจ้งหนี้ / ชำระเงิน
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* แถบเมนูด้านล่างสำหรับมือถือ (แสดงเมื่อปิดตะกร้า) */}
        {!isMobileCartOpen && (
          <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4 px-6 flex justify-between items-center z-40 pb-safe shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-8">
            <div>
              <p className="text-xs text-gray-500 font-semibold mb-0.5">รวม {totalItems} รายการ</p>
              <p className="text-xl font-extrabold text-blue-600">฿{totalAmount.toLocaleString()}</p>
            </div>
            <button onClick={() => setIsMobileCartOpen(true)} className="bg-gray-900 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-gray-400 active:scale-95 flex items-center gap-2">
              🛒 ดูตะกร้า
            </button>
          </div>
        )}
      </div>

      {/* --- ส่วนที่ 1: Modal รายการบิลค้างชำระ --- */}
      {showPendingModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
             <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                 <div className="p-4 bg-orange-500 text-white flex justify-between items-center">
                    <h2 className="text-lg font-bold">🧾 รายการบิลค้างชำระ</h2>
                    <button onClick={() => { setShowPendingModal(false); setSelectedPendingOrder(null); }} className="text-white font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20">✕</button>
                 </div>
                 
                 <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-gray-50">
                    {!selectedPendingOrder ? (
                        <>
                            {pendingOrders.length === 0 ? (
                                <p className="text-center text-gray-500 mt-10 font-medium">ไม่มีบิลค้างชำระในระบบ</p>
                            ) : (
                                <div className="space-y-3">
                                    {pendingOrders.map(order => (
                                        <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                            <div>
                                                <p className="font-bold text-gray-800 text-sm">{order.doc_no}</p>
                                                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                                            </div>
                                            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                                <span className="font-black text-blue-600 text-lg">฿{order.total_amount.toLocaleString()}</span>
                                                <button onClick={() => setSelectedPendingOrder(order)} className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg font-bold text-sm">รับเงิน</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="animate-fade-in">
                            <button onClick={() => setSelectedPendingOrder(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-4 font-bold">← ย้อนกลับไปหน้ารายการ</button>
                            <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm mb-4 text-center">
                                <p className="text-gray-500 text-sm">เลขที่บิล: {selectedPendingOrder.doc_no}</p>
                                <h3 className="text-3xl font-black text-blue-600 mt-1">฿{selectedPendingOrder.total_amount.toLocaleString()}</h3>
                            </div>
                            
                            <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm">
                                <label className="block text-sm font-bold text-gray-700 mb-3">เลือกวิธีชำระเงิน</label>
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                  <button onClick={() => setPaymentMethod("cash")} className={`py-3 rounded-xl font-bold border-2 transition-all ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>💵 เงินสด</button>
                                  <button onClick={() => setPaymentMethod("transfer")} className={`py-3 rounded-xl font-bold border-2 transition-all ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>📱 โอนเงิน/QR</button>
                                </div>

                                {paymentMethod === "transfer" && storeSettings?.promptpay_number && (
                                <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100 flex flex-col items-center">
                                    <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                                      <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, selectedPendingOrder.total_amount)} size={140} />
                                    </div>
                                    <p className="font-bold text-blue-800 mt-3 text-sm">ให้ลูกค้าสแกน QR เพื่อโอนเงิน</p>
                                </div>
                                )}

                                {paymentMethod === "cash" && (
                                <div className="mt-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">รับเงินสดมา</label>
                                    <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value ? Number(e.target.value) : "")} className="w-full px-4 py-3 text-xl font-bold border-2 border-gray-300 rounded-xl outline-none focus:border-blue-400 transition-all text-center" placeholder="0.00" />
                                </div>
                                )}
                            </div>
                        </div>
                    )}
                 </div>
                 
                 {selectedPendingOrder && (
                    <div className="p-4 bg-white border-t">
                        <button onClick={handlePayPendingOrder} disabled={isProcessing} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg text-lg flex items-center justify-center gap-2 active:scale-95 transition-all">
                            {isProcessing ? "กำลังบันทึก..." : "✅ ยืนยันรับเงิน / ออกใบเสร็จ"}
                        </button>
                    </div>
                 )}
             </div>
          </div>
      )}

      {/* --- ส่วนที่ 2: Modal การชำระเงิน / ยืนยันบิล (แทนที่ Pop-up ธรรมดา) --- */}
      {showCheckout && storeSettings && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-blue-600 text-white flex justify-between items-center rounded-t-3xl">
              <h2 className="text-lg font-bold flex items-center gap-2">📝 {storeSettings.invoice_title || "รายละเอียดใบแจ้งหนี้"}</h2>
              <button onClick={() => setShowCheckout(false)} className="text-white font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20">✕</button>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-gray-50">
              <div className="text-center mb-5">
                <h3 className="text-xl font-black text-gray-800">{storeSettings.name}</h3>
              </div>

              <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm mb-4">
                <div className="space-y-3 mb-4 pb-4 border-b border-dashed border-gray-300">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex flex-col text-sm text-gray-700">
                      <div className="flex justify-between items-start">
                        <span className="font-medium pr-2">{item.cart_qty} x {item.name}</span>
                        <span className="font-bold whitespace-nowrap">฿{(item.price * item.cart_qty).toLocaleString()}</span>
                      </div>
                      {item.remark && <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-md mt-1 self-start">- หมายเหตุ: {item.remark}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center text-xl md:text-2xl font-black text-blue-600 bg-blue-50 p-3 rounded-xl">
                  <span>ยอดชำระสุทธิ</span>
                  <span>฿{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm">
                <label className="block text-sm font-bold text-gray-700 mb-3">รูปแบบการชำระเงิน</label>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button onClick={() => setPaymentMethod("cash")} className={`py-3 rounded-xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${paymentMethod === "cash" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}><span className="text-2xl">💵</span> เงินสด</button>
                  <button onClick={() => setPaymentMethod("transfer")} className={`py-3 rounded-xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${paymentMethod === "transfer" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}><span className="text-2xl">📱</span> โอนเงิน</button>
                </div>

                {paymentMethod === "transfer" && (
                  <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100 flex flex-col items-center">
                    {storeSettings.promptpay_number ? (
                      <>
                        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                          <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={150} />
                        </div>
                        <p className="font-bold text-blue-800 mt-3 text-sm">สแกนเพื่อโอนเงินเข้าพร้อมเพย์</p>
                      </>
                    ) : (
                      <p className="text-red-500 font-bold text-sm bg-white p-3 rounded-lg w-full border border-red-200">ยังไม่ได้ตั้งค่าเบอร์ PromptPay ในระบบ</p>
                    )}
                  </div>
                )}

                {paymentMethod === "cash" && (
                  <div className="mt-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">รับเงินสดจากลูกค้า (บาท)</label>
                    <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value ? Number(e.target.value) : "")} className="w-full px-4 py-3 text-2xl font-black text-center text-gray-800 border-2 border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner" placeholder="0.00" />
                    {changeAmount > 0 && (
                      <div className="mt-4 flex justify-between items-center text-lg bg-green-100 border border-green-300 text-green-800 p-4 rounded-xl font-black shadow-sm animate-pulse-once">
                        <span>เงินทอนลูกค้า</span>
                        <span className="text-2xl">฿{changeAmount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-white border-t flex flex-col gap-3 pb-safe">
              <div className="flex gap-3">
                <button onClick={() => window.print()} className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-4 py-3.5 rounded-xl transition-all flex-1 text-sm border border-gray-300 shadow-sm active:scale-95 flex items-center justify-center gap-2">🖨️ พิมพ์ใบแจ้งหนี้</button>
                <button onClick={handleSavePendingOrder} disabled={isProcessing} className="bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-300 font-bold px-4 py-3.5 rounded-xl transition-all flex-1 shadow-sm text-sm active:scale-95 flex items-center justify-center gap-2">
                  ⏳ บันทึกค้างชำระ
                </button>
              </div>
              <button onClick={handleConfirmPayment} disabled={isProcessing} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform">
                {isProcessing ? "กำลังบันทึก..." : "✅ ยืนยันชำระเงิน / ออกใบเสร็จ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- โครงสร้างสำหรับระบบพิมพ์ (ซ่อนอยู่หลังบ้าน จะโชว์ตอนสั่ง Print เท่านั้น) --- */}
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
            <span>ยอดชำระสุทธิ</span>
            <span>{totalAmount.toFixed(2)} ฿</span>
          </div>
          {storeSettings.promptpay_number && (
            <div className="text-center my-2">
              <div className="flex justify-center">
                <QRCodeSVG value={generatePromptPayPayload(storeSettings.promptpay_number, totalAmount)} size={110} />
              </div>
              <p style={{ fontSize: '8px' }} className="mt-1">สแกนชำระผ่าน QR Code</p>
            </div>
          )}
        </div>
      )}

      {/* --- ส่วนที่ 3: Modal ใบเสร็จรับเงิน (ขึ้นเมื่อกดจ่ายเงินสำเร็จ) --- */}
      {receiptData && storeSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative animate-fade-in-up">
            
            <div className="p-4 bg-green-500 text-white flex justify-between items-center rounded-t-3xl">
              <h2 className="font-bold text-lg flex items-center gap-2">✅ ชำระเงินเรียบร้อย</h2>
              <button onClick={() => setReceiptData(null)} className="text-white font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20">✕</button>
            </div>

            <div className="p-6 bg-white overflow-y-auto max-h-[60vh]">
              <div className="text-center mb-5 border-b border-dashed border-gray-300 pb-4">
                {storeSettings.logo_url && (
                  <div className="flex justify-center mb-3">
                    <Image src={storeSettings.logo_url} alt="Logo" width={56} height={56} className="object-contain border border-gray-100 rounded-lg p-1 shadow-sm" unoptimized />
                  </div>
                )}
                <h1 className="font-black text-xl text-gray-800">{storeSettings.name}</h1>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">{storeSettings.address}</p>
                {storeSettings.phone_number && <p className="text-gray-500 text-xs font-medium mt-0.5">โทร: {storeSettings.phone_number}</p>}
                {storeSettings.tax_id && <p className="text-gray-500 text-xs font-medium mt-0.5">TAX ID: {storeSettings.tax_id}</p>}
                
                <div className="mt-4 inline-block bg-gray-100 text-gray-800 px-4 py-1.5 rounded-full font-bold text-sm tracking-wide border border-gray-200">
                  {storeSettings.receipt_title || "ใบเสร็จรับเงิน"}
                </div>
              </div>
              
              <div className="flex justify-between mb-4 text-xs bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="space-y-1 text-gray-600">
                  <p>เลขที่บิล: <span className="font-bold text-gray-800">{receiptData.docNo}</span></p>
                  <p>วันที่ทำรายการ: <span className="font-medium">{receiptData.date.toLocaleString('th-TH')}</span></p>
                </div>
              </div>

              <div className="space-y-3 mb-4 border-b border-dashed border-gray-300 pb-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">รายการสินค้า</p>
                {receiptData.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-2">
                        <p className="font-bold text-gray-800">{item.name} {item.is_vat_exempt && <span className="text-[10px] text-orange-500">(V0)</span>}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.cart_qty} ชิ้น x ฿{item.price.toLocaleString()}</p>
                      </div>
                      <div className="text-right font-bold text-gray-800">
                        ฿{(item.price * item.cart_qty).toLocaleString()}
                      </div>
                    </div>
                    {item.remark && <span className="text-[11px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md mt-1 self-start inline-block">- {item.remark}</span>}
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-4 border-b border-dashed border-gray-300 pb-4 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>มูลค่ายกเว้นภาษี (VAT 0%)</span>
                  <span className="font-medium">฿{receiptData.totalExempt.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>มูลค่าสินค้าก่อน VAT</span>
                  <span className="font-medium">฿{receiptData.totalVatable.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
                  <span className="font-medium">฿{receiptData.vatAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-black mt-3 text-base text-gray-900 bg-gray-100 p-2 rounded-lg">
                  <span>ยอดสุทธิ</span>
                  <span className="text-blue-600">฿{receiptData.totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2 mb-6 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>รับเงิน ({receiptData.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน'})</span>
                  <span className="font-bold">฿{receiptData.paymentMethod === 'cash' ? Number(receiptData.cashReceived).toLocaleString() : receiptData.totalAmount.toLocaleString()}</span>
                </div>
                {receiptData.changeAmount > 0 && (
                  <div className="flex justify-between font-bold text-green-600">
                    <span>เงินทอน</span>
                    <span>฿{receiptData.changeAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="text-center text-gray-400 text-xs mt-8">
                <p className="font-medium text-gray-600">{storeSettings.receipt_footer || "ขอขอบคุณที่มาอุดหนุนและใช้บริการ"}</p>
                <p className="mt-1 text-[10px]">Powered by POS System</p>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
              <button onClick={() => setReceiptData(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-xl transition-colors">ปิดหน้านี้</button>
              <button onClick={() => window.print()} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-transform flex items-center justify-center gap-2">🖨️ พิมพ์สลิป (58mm)</button>
            </div>
          </div>
        </div>
      )}

      {/* --- โครงสร้างใบเสร็จสำหรับปริ้นท์ --- */}
      {receiptData && storeSettings && (
        <div id="receipt-print-area">
          <div className="text-center mb-2">
            {storeSettings.logo_url && (
              <div className="flex justify-center mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={storeSettings.logo_url} alt="Logo" crossOrigin="anonymous" style={{ maxWidth: '40px', height: 'auto', objectFit: 'contain' }} />
              </div>
            )}
            <h1 className="font-bold" style={{ fontSize: '12px' }}>{storeSettings.name}</h1>
            <p style={{ fontSize: '8px' }}>{storeSettings.address}</p>
            {storeSettings.phone_number && <p style={{ fontSize: '8px' }}>โทร: {storeSettings.phone_number}</p>}
            {storeSettings.tax_id && <p style={{ fontSize: '8px' }}>TAX ID: {storeSettings.tax_id}</p>}
            <p className="mt-1 font-bold border-y border-dashed border-gray-400 py-1" style={{ fontSize: '10px' }}>
              {storeSettings.receipt_title || "ใบเสร็จรับเงิน"}
            </p>
          </div>

          <div className="flex justify-between mb-2" style={{ fontSize: '8px' }}>
            <div>
              <p>บิล: <span className="font-bold">{receiptData.docNo}</span></p>
              <p>วันที่: {receiptData.date.toLocaleString('th-TH')}</p>
            </div>
          </div>

          <div className="space-y-1 mb-2 border-b border-dashed border-gray-400 pb-2" style={{ fontSize: '9px' }}>
            {receiptData.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start mb-1">
                <div className="flex-1 pr-1">
                  <p className="font-bold">{item.name} {item.is_vat_exempt && <span style={{ fontSize: '7px' }}>(V0)</span>}</p>
                  {item.remark && <p style={{ fontSize: '7px', fontStyle: 'italic', color: '#555' }}>- {item.remark}</p>}
                  <p style={{ fontSize: '8px' }}>{item.cart_qty} x {item.price.toLocaleString()}</p>
                </div>
                <div className="text-right font-bold pt-1">
                  {(item.price * item.cart_qty).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1 mb-2 border-b border-dashed border-gray-400 pb-2" style={{ fontSize: '8px' }}>
            <div className="flex justify-between">
              <span>ยกเว้นภาษี (VAT 0%)</span>
              <span>{receiptData.totalExempt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>ก่อน VAT</span>
              <span>{receiptData.totalVatable.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT 7%</span>
              <span>{receiptData.vatAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-black mt-1" style={{ fontSize: '11px' }}>
              <span>ยอดสุทธิ</span>
              <span>{receiptData.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-1 mb-3" style={{ fontSize: '8px' }}>
            <div className="flex justify-between">
              <span>รับเงิน ({receiptData.paymentMethod === 'cash' ? 'สด' : 'โอน'})</span>
              <span>{receiptData.paymentMethod === 'cash' ? Number(receiptData.cashReceived).toLocaleString() : receiptData.totalAmount.toLocaleString()}</span>
            </div>
            {receiptData.changeAmount > 0 && (
              <div className="flex justify-between font-bold">
                <span>เงินทอน</span>
                <span>{receiptData.changeAmount.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="text-center text-gray-600" style={{ fontSize: '8px' }}>
            <p className="font-bold">{storeSettings.receipt_footer || "ขอบคุณที่ใช้บริการ"}</p>
          </div>
        </div>
      )}
    </>
  );
}