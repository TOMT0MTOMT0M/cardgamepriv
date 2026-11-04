import subprocess

out = subprocess.check_output(['tar', '-tf', r'C:\Users\Tom\Desktop\cardgamepriv\imports\Duel_Links_B.rar']).decode('utf-8', 'ignore')
lines = out.splitlines()
print(f"Total entries: {len(lines)}")
for l in lines[:50]:
    print(" ", l)
