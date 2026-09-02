# i41 证件水印

纯前端、本地 Canvas 渲染的身份证、营业执照、合同截图等敏感图片防盗用水印工具。

## 特点

- 图片不上传、不保存、不经过业务服务器
- 支持 JPG、PNG、WebP
- 多图批量处理与下载
- 水印文字、颜色、透明度、字号、角度、横纵间距
- 日期、时间和文件名变量
- 实名认证、入职审核、银行开户等模板
- PWA离线使用
- 无后端、无远程模型、无分析脚本
- i41 工具生态导航：i方案、开发者工具、图片压缩、PDF 工具、证件照、临时剪贴板

## i41 工具生态

- [i方案](https://www.i41.cn)
- [开发者工具](https://tools.i41.cn)
- [图片压缩](https://imgzip.i41.cn)
- [PDF 工具](https://pdf.i41.cn)
- [证件照](https://idphoto.i41.cn)
- [临时剪贴板](https://clip.i41.cn)
- [证件水印](https://watermark.i41.cn)

## 开发

```bash
npm test
python3 -m http.server 8000
```

## 部署

纯静态站点，可直接部署到 Cloudflare Pages：

- 构建命令：留空
- 输出目录：`/`
- 域名：`watermark.i41.cn`

## 许可证

原创代码采用 [MIT License](LICENSE)。
