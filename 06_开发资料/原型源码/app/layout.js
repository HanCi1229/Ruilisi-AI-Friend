export const metadata = {
  title: '瑞丽丝 P0 v0.7.1a 数字生命桌面原型',
  description: '瑞丽丝数字生命桌面产品 P0：生活、陪伴、协作与专注原型'
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: '#050914', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
