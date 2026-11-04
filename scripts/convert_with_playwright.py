import os
import json
from playwright.sync_api import sync_playwright

def convert_monster(fbx_rel_path, tex_rel_path, target_card_id, scale_height=2.2):
    base_dir = r"C:\Users\Tom\Desktop\cardgamepriv"
    fbx_abs = os.path.join(base_dir, "imports", fbx_rel_path)
    tex_abs = os.path.join(base_dir, "imports", tex_rel_path)
    out_glb = os.path.join(base_dir, "public", "fx", "yugioh", "models", f"{target_card_id}.glb")

    print(f"\n--- Converting {target_card_id} ---")
    print(f"FBX: {fbx_abs}")
    print(f"Texture: {tex_abs}")
    print(f"Target: {out_glb}")

    # Read FBX as base64
    import base64
    with open(fbx_abs, "rb") as f:
        fbx_b64 = base64.b64encode(f.read()).decode("ascii")
    with open(tex_abs, "rb") as f:
        tex_b64 = base64.b64encode(f.read()).decode("ascii")

    # Three.js script to run in browser
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/fflate@0.7.4/umd/index.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js"></script>
    </head>
    <body>
      <script>
        async function runConversion() {{
          try {{
            // Decode FBX
            const fbxData = atob("{fbx_b64}");
            const fbxBytes = new Uint8Array(fbxData.length);
            for (let i = 0; i < fbxData.length; i++) {{
              fbxBytes[i] = fbxData.charCodeAt(i);
            }}

            const loader = new THREE.FBXLoader();
            const obj = loader.parse(fbxBytes.buffer, "");

            // Decode texture
            const texImg = new Image();
            await new Promise((resolve, reject) => {{
              texImg.onload = resolve;
              texImg.onerror = reject;
              texImg.src = "data:image/png;base64,{tex_b64}";
            }});

            const texture = new THREE.Texture(texImg);
            texture.needsUpdate = true;
            texture.flipY = false;

            const mat = new THREE.MeshStandardMaterial({{
              map: texture,
              roughness: 0.5,
              metalness: 0.1
            }});

            obj.traverse((child) => {{
              if (child.isMesh) {{
                child.material = mat;
                child.castShadow = true;
                child.receiveShadow = true;
              }}
            }});

            // Scale & Center
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = {scale_height} / maxDim;
            obj.scale.set(scale, scale, scale);

            const scaledBox = new THREE.Box3().setFromObject(obj);
            obj.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
            obj.position.y -= scaledBox.min.y;
            obj.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;

            const root = new THREE.Group();
            root.name = "{target_card_id}Root";
            root.add(obj);

            // Animations: summon & idle
            const summonScale = new THREE.VectorKeyframeTrack(
              "{target_card_id}Root.scale",
              [0, 0.7, 1.4, 2.0],
              [0.01, 0.01, 0.01, 0.85, 0.85, 0.85, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
            );
            const summonRot = new THREE.QuaternionKeyframeTrack(
              "{target_card_id}Root.quaternion",
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
              "{target_card_id}Root.position",
              [0, 1.2, 2.4],
              [0, 0, 0, 0, 0.12, 0, 0, 0, 0]
            );
            const idleRot = new THREE.QuaternionKeyframeTrack(
              "{target_card_id}Root.quaternion",
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
              (gltf) => {{
                // gltf is ArrayBuffer
                const bytes = new Uint8Array(gltf);
                let binary = "";
                for (let i = 0; i < bytes.length; i++) {{
                  binary += String.fromCharCode(bytes[i]);
                }}
                window.resultBase64 = btoa(binary);
                window.conversionDone = true;
              }},
              {{ binary: true, animations: [summonClip, idleClip] }}
            );
          }} catch (err) {{
            window.conversionError = err.toString() + "\\n" + err.stack;
            window.conversionDone = true;
          }}
        }}
        runConversion();
      </script>
    </body>
    </html>
    """

    temp_html = os.path.join(base_dir, "scripts", "temp_convert.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"file:///{temp_html.replace(os.sep, '/')}")
        page.wait_for_function("window.conversionDone === true", timeout=60000)
        
        err = page.evaluate("window.conversionError")
        if err:
            print("Conversion error in browser:", err)
            browser.close()
            return False

        res_b64 = page.evaluate("window.resultBase64")
        browser.close()

    res_bytes = base64.b64decode(res_b64)
    with open(out_glb, "wb") as f:
        f.write(res_bytes)

    print(f"SUCCESS: Wrote {out_glb} ({len(res_bytes)} bytes)")
    return True

if __name__ == "__main__":
    convert_monster(
        r"Cross Duel Models\dark magician\04041_01J.fbx",
        r"Cross Duel Models\dark magician\tex_04041_01J_1_def.png",
        "dark-magician"
    )
