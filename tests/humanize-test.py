#!/usr/bin/env python3
"""
Test humanize package - Python native version
"""

import humanize

# Test intcomma - format numbers with commas
print("=== Intcomma Tests ===")
print(f"intcomma(100) = {humanize.intcomma(100)}")
print(f"intcomma(1000) = {humanize.intcomma(1000)}")
print(f"intcomma(1000000) = {humanize.intcomma(1000000)}")
print(f"intcomma(1234567.25) = {humanize.intcomma(1234567.25)}")

# Test intword - convert large numbers to words
print("\n=== Intword Tests ===")
print(f"intword(100) = {humanize.intword(100)}")
print(f"intword(12400) = {humanize.intword(12400)}")
print(f"intword(1000000) = {humanize.intword(1000000)}")
print(f"intword(1200000000) = {humanize.intword(1200000000)}")

# Test naturalsize - format file sizes
print("\n=== Naturalsize Tests ===")
print(f"naturalsize(300) = {humanize.naturalsize(300)}")
print(f"naturalsize(3000) = {humanize.naturalsize(3000)}")
print(f"naturalsize(3000000) = {humanize.naturalsize(3000000)}")
print(f"naturalsize(3000000000) = {humanize.naturalsize(3000000000)}")

# Test ordinal - convert to ordinal
print("\n=== Ordinal Tests ===")
print(f"ordinal(1) = {humanize.ordinal(1)}")
print(f"ordinal(2) = {humanize.ordinal(2)}")
print(f"ordinal(3) = {humanize.ordinal(3)}")
print(f"ordinal(11) = {humanize.ordinal(11)}")
print(f"ordinal(111) = {humanize.ordinal(111)}")
print(f"ordinal(1002) = {humanize.ordinal(1002)}")

# Test apnumber - Associated Press style
print("\n=== Apnumber Tests ===")
print(f"apnumber(0) = {humanize.apnumber(0)}")
print(f"apnumber(5) = {humanize.apnumber(5)}")
print(f"apnumber(9) = {humanize.apnumber(9)}")
print(f"apnumber(10) = {humanize.apnumber(10)}")

# Test fractional - convert to fractions
print("\n=== Fractional Tests ===")
print(f"fractional(0.5) = {humanize.fractional(0.5)}")
print(f"fractional(0.3) = {humanize.fractional(0.3)}")
print(f"fractional(1.3) = {humanize.fractional(1.3)}")
print(f"fractional(1) = {humanize.fractional(1)}")

# Test scientific - scientific notation
# Note: explicitly passing precision=2 to match default
print("\n=== Scientific Tests ===")
print(f"scientific(500, 2) = {humanize.scientific(500, 2)}")
print(f"scientific(0.3, 2) = {humanize.scientific(0.3, 2)}")
print(f"scientific(-1000, 2) = {humanize.scientific(-1000, 2)}")

# Test metric - metric SI unit-prefix
# Note: explicitly passing precision=3 to match default
print("\n=== Metric Tests ===")
print(f"metric(1500, 'V', 3) = {humanize.metric(1500, 'V', 3)}")
print(f"metric(2e8, 'W', 3) = {humanize.metric(2e8, 'W', 3)}")
print(f"metric(220e-6, 'F', 3) = {humanize.metric(220e-6, 'F', 3)}")

# Test natural_list - natural list formatting
print("\n=== Natural List Tests ===")
print(f"natural_list(['one', 'two', 'three']) = {humanize.natural_list(['one', 'two', 'three'])}")
print(f"natural_list(['one', 'two']) = {humanize.natural_list(['one', 'two'])}")
print(f"natural_list(['one']) = {humanize.natural_list(['one'])}")

print("\n=== All tests completed ===")
