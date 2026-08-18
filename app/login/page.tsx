"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter(); // แก้ไข: ประกาศใช้งาน router ตรงนี้
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      // สำหรับผู้ใช้เก่า เข้าสู่ระบบ
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert("เข้าสู่ระบบไม่สำเร็จ: " + error.message);
      } else {
        alert("เข้าสู่ระบบสำเร็จ!");
        router.push("/dashboard"); // แก้ไข: ใช้ router.push แทน window.location.href
      }
    } else {
      // สำหรับผู้ใช้ใหม่ สมัครสมาชิก
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert("สมัครสมาชิกไม่สำเร็จ: " + error.message);
      } else {
        alert("สมัครสมาชิกสำเร็จ! กรุณาตั้งชื่อร้านของคุณ");
        router.push("/setup-store"); // แก้ไข: ใช้ router.push แทน window.location.href
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {isLogin ? "เข้าสู่ระบบ POS" : "สมัครใช้งานระบบ POS"}
          </h1>
          <p className="text-gray-500 mt-2">
            {isLogin ? "ยินดีต้อนรับกลับมา!" : "เริ่มต้นสร้างร้านค้าของคุณได้ฟรี"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-blue-400"
          >
            {loading ? "กำลังประมวลผล..." : isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-600 hover:underline font-medium"
          >
            {isLogin ? "ยังไม่มีบัญชี? สมัครใช้งานที่นี่" : "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ"}
          </button>
        </div>
      </div>
    </div>
  );
}