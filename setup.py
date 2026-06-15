from setuptools import setup, find_packages
setup(
    name="kg-mcp",
    version="0.1.0",
    packages=find_packages("src"),
    package_dir={"": "src"},
    install_requires=[
        "fastmcp>=1.0.0",
        "networkx>=3.0",
        "sentence-transformers>=3.0",
    ],
    entry_points={
        "console_scripts": [
            "kg-mcp=kg_mcp.__main__:main",
        ],
    },
    python_requires=">=3.12",
)
