# umo: import alascode.ts

from pydash import strings as s

def main() -> str:
    print("Hello boss!")
    print(s.words("Hello boss!"))        # ['hello', 'world']
    result = myCode("hello!")
    print(result)
    return result

if __name__ == '__main__':
    main()
