# Extract the embedded topology Engine and palette data from color-ramp.html into this folder.
import re, os, sys
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, '../../../color-ramp.html')).read()
open(os.path.join(here, 'pals.json'), 'w').write(re.search(r'id="pals">(.*?)</script>', s, re.S).group(1))
eng = re.search(r'<script>\s*(var Engine = \(function \(\) \{.*?\}\)\(\);)\s*</script>', s, re.S).group(1)
open(os.path.join(here, 'engine.cjs'), 'w').write(eng + '\nmodule.exports = Engine;\n')
