from app.core.config import settings
from app.grpc_server.server import create_server


def run() -> None:
    server = create_server()
    server.add_insecure_port(f"{settings.grpc_host}:{settings.grpc_port}")
    server.start()
    print(f"ai-service gRPC listening on {settings.grpc_host}:{settings.grpc_port}")
    server.wait_for_termination()


if __name__ == "__main__":
    run()
