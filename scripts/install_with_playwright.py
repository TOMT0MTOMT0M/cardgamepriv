import os
import base64
from playwright.sync_api import sync_playwright

models = [
    {
        "src": r"C:\Users\Tom\Desktop\cardgamepriv\imports\extracted\Obelisk_The_Tormentor.glb",
        "target": "obelisk-the-tormentor.glb",
        "name": "obelisk-the-tormentor",
        "scale": 2.5
    },
    {
        "src": r"C:\Users\Tom\Desktop\cardgamepriv\imports\extracted\Slifer_The_Sky_Dragon_Duel_Links_Model.glb",
        "target": "slifer-the-sky-dragon.glb",
        "name": "slifer-the-sky-dragon",
        "scale": 2.5
    },
    {
        "src": r"C:\Users\Tom\Desktop\cardgamepriv\imports\extracted\Seto_Kaiba.glb",
        "target": "seto-kaiba.glb",
        "name": "seto-kaiba",
        "scale": 1.85
    },
    {
        "src": r"C:\Users\Tom\Desktop\cardgamepriv\imports\extracted\Yugi_Muto.glb",
        "target": "yami-yugi.glb",
        "name": "yami-yugi",
        "scale": 1.7
    }
]

target_dir = r"C:\Users\Tom\Desktop\cardgamepriv\public\fx\yugioh\models"
os.makedirs(target_dir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    for m in models:
        src = m["src"]
        target = m["target"]
        name = m["name"]
        scale_height = m["scale"]
        out_path = os.path.join(target_dir, target)

        print(f"\nProcessing {name} from {src}...")
        with open(src, "rb") as f:
            b64_data = base64.b64encode(f.read()).decode("ascii")

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js"></script>
        </head>
        <body>
          <script>
            async function run() {{
              try {{
                const binStr = atob("{b64_data}");
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) {{
                  bytes[i] = binStr.charCodeAt(i);
                }}

                const loader = new THREE.GLTFLoader();
                const gltf = await new Promise((res, rej) => {{
                  loader.parse(bytes.buffer, "", res, rej);
                }});

                const scene = gltf.scene;

                // Scale and center
                const box = new THREE.Box3().setFromObject(scene);
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = {scale_height} / maxDim;
                scene.scale.set(scale, scale, scale);

                const scaledBox = new THREE.Box3().setFromObject(scene);
                scene.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
                scene.position.y -= scaledBox.min.y;
                scene.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;

                const root = new THREE.Group();
                root.name = "{name}Root";
                root.add(scene);

                // Animations: summon & idle
                const summonScale = new THREE.VectorKeyframeTrack(
                  "{name}Root.scale",
                  [0, 0.7, 1.4, 2.0],
                  [0.01, 0.01, 0.01, 0.85, 0.85, 0.85, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
                );
                const summonRot = new THREE.QuaternionKeyframeTrack(
                  "{name}Root.quaternion",
                  [0, 0.7, 1.4, 2.0],
                  [
                    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.3, 0)).toArray(),
                    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.1, 0)).toArray(),
                    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)).toArray(),
                    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
                  ]
                );
                const summonClip = new THREE.AnimationClip("summon", 2.0, [summonScale, summonRot]);

                const idlePos = new THREE.VectorKeyframeTrack(
                  "{name}Root.position",
                  [0, 1.2, 2.4],
                  [0, 0, 0, 0, 0.12, 0, 0, 0, 0]
                );
                const idleRot = new THREE.QuaternionKeyframeTrack(
                  "{name}Root.quaternion",
                  [0, 1.2, 2.4],
                  [
                    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.05, 0.02)).toArray(),
                    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.05, -0.02)).toArray(),
                    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.05, 0.02)).toArray()
                  ]
                );
                const idleClip = new THREE.AnimationClip("idle", 2.4, [idlePos, idleRot]);

                const exporter = new THREE.GLTFExporter();
                exporter.parse(
                  root,
                  (resGltf) => {{
                    const resBytes = new Uint8Array(resGltf);
                    let resBin = "";
                    for (let i = 0; i < resBytes.length; i++) {{
                      resBin += String.fromCharCode(resBytes[i]);
                    }}
                    window.resultB64 = btoa(resBin);
                    window.done = true;
                  }},
                  {{ binary: true, animations: [summonClip, idleClip] }}
                );
              }} catch (err) {{
                window.error = err.toString() + "\\n" + err.stack;
                window.done = true;
              }}
            }}
            run();
          </script>
        </body>
        </html>
        """

        temp_html = r"C:\Users\Tom\Desktop\cardgamepriv\scripts\temp_proc.html"
        with open(temp_html, "w", encoding="utf-8") as f:
            f.write(html_content)

        page.goto(f"file:///{temp_html.replace(os.sep, '/')}")
        page.wait_for_function("window.done === true", timeout=60000)

        err = page.evaluate("window.error")
        if err:
            print("Error in browser:", err)
            continue

        res_b64 = page.evaluate("window.resultB64")
        res_bytes = base64.b64decode(res_b64)
        with open(out_path, "wb") as f:
            f.write(res_bytes)

        print(f"SUCCESS: Wrote {out_path} ({len(res_bytes)} bytes)")

    browser.close()
